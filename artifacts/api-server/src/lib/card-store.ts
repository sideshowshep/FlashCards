import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const heicConvert = require("heic-convert") as {
  (options: {
    buffer: Buffer;
    format: "JPEG" | "PNG";
    quality?: number;
  }): Promise<Uint8Array>;
};

export type Crop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StoredCard = {
  id: string;
  title: string;
  category: string | null;
  imageUrl: string;
  imageFile: string;
  createdAt: string;
  updatedAt: string;
};

const dataRoot = path.resolve(
  process.env.FLASHCARDS_DATA_DIR ?? path.join(process.cwd(), "data"),
);
const imageRoot = path.join(dataRoot, "images");
const cardsPath = path.join(dataRoot, "cards.json");

let writeQueue = Promise.resolve();

async function ensureStore() {
  await mkdir(imageRoot, { recursive: true });
  try {
    await readFile(cardsPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(cardsPath, "[]\n", "utf8");
  }
}

async function readCards(): Promise<StoredCard[]> {
  await ensureStore();
  const raw = await readFile(cardsPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("The flashcard catalogue is not a JSON array");
  }
  return parsed as StoredCard[];
}

async function writeCards(cards: StoredCard[]) {
  await ensureStore();
  writeQueue = writeQueue.then(() =>
    writeFile(cardsPath, `${JSON.stringify(cards, null, 2)}\n`, "utf8"),
  );
  await writeQueue;
}

function normaliseCategory(category: string | null | undefined) {
  const value = category?.trim();
  return value ? value : null;
}

function getCenteredPortraitCrop(width: number, height: number): Crop {
  const aspect = 4 / 5;
  const cropWidth = width / height >= aspect ? height * aspect : width;
  const cropHeight = cropWidth / aspect;
  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

function parseDataUrl(imageData: string) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(imageData);
  if (!match) {
    throw new Error("Image must be provided as a base64 data URL");
  }

  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], "base64"),
  };
}

async function prepareImage(
  imageData: string,
  crop: Crop | undefined,
  outputPath: string,
) {
  const parsed = parseDataUrl(imageData);
  if (!parsed.buffer.length) throw new Error("Image data is empty");

  let input = parsed.buffer;
  const isHeic =
    parsed.mimeType.includes("heic") || parsed.mimeType.includes("heif");

  if (isHeic) {
    input = Buffer.from(
      await heicConvert({ buffer: parsed.buffer, format: "JPEG", quality: 0.92 }),
    );
  }

  let image = sharp(input).rotate();
  const metadata = await image.metadata();

  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;
  if (!originalWidth || !originalHeight) {
    throw new Error("Could not read image dimensions");
  }

  const selectedCrop = crop ?? getCenteredPortraitCrop(originalWidth, originalHeight);
  const left = Math.max(0, Math.min(originalWidth - 1, Math.floor(selectedCrop.x)));
  const top = Math.max(0, Math.min(originalHeight - 1, Math.floor(selectedCrop.y)));
  const width = Math.max(
    1,
    Math.min(originalWidth - left, Math.floor(selectedCrop.width)),
  );
  const height = Math.max(
    1,
    Math.min(originalHeight - top, Math.floor(selectedCrop.height)),
  );
  image = image.extract({ left, top, width, height });

  await image
    .resize({
      width: 1800,
      height: 1800,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88, progressive: true })
    .toFile(outputPath);
}

export async function listCards(category?: string) {
  const cards = await readCards();
  const filtered = category?.trim()
    ? cards.filter((card) => card.category === category.trim())
    : cards;
  return filtered.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getRandomCard(category?: string) {
  const cards = await listCards(category);
  if (!cards.length) return undefined;
  return cards[Math.floor(Math.random() * cards.length)];
}

export async function getSummary() {
  const cards = await readCards();
  const categories = new Set(
    cards
      .map((card) => card.category)
      .filter((category): category is string => Boolean(category)),
  );
  return {
    total: cards.length,
    categories: categories.size,
    uncategorized: cards.filter((card) => !card.category).length,
  };
}

export async function createCard(input: {
  title: string;
  category?: string | null;
  imageData: string;
  crop?: Crop;
}) {
  const now = new Date().toISOString();
  const id = randomUUID();
  const imageFile = `${id}.jpg`;
  await prepareImage(input.imageData, input.crop, path.join(imageRoot, imageFile));

  const card: StoredCard = {
    id,
    title: input.title.trim(),
    category: normaliseCategory(input.category),
    imageUrl: `/api/cards/images/${imageFile}`,
    imageFile,
    createdAt: now,
    updatedAt: now,
  };
  const cards = await readCards();
  cards.push(card);
  await writeCards(cards);
  return card;
}

export async function updateCard(
  id: string,
  input: {
    title: string;
    category?: string | null;
    imageData?: string;
    crop?: Crop;
  },
) {
  const cards = await readCards();
  const index = cards.findIndex((card) => card.id === id);
  if (index < 0) return undefined;

  const existing = cards[index];
  let imageUrl = existing.imageUrl;
  let imageFile = existing.imageFile;
  if (input.imageData) {
    imageFile = `${id}-${Date.now()}.jpg`;
    await prepareImage(input.imageData, input.crop, path.join(imageRoot, imageFile));
    imageUrl = `/api/cards/images/${imageFile}`;
  }

  const updated: StoredCard = {
    ...existing,
    title: input.title.trim(),
    category: normaliseCategory(input.category),
    imageUrl,
    imageFile,
    updatedAt: new Date().toISOString(),
  };
  cards[index] = updated;
  await writeCards(cards);

  if (imageFile !== existing.imageFile) {
    await unlink(path.join(imageRoot, existing.imageFile)).catch(() => undefined);
  }
  return updated;
}

export async function deleteCard(id: string) {
  const cards = await readCards();
  const index = cards.findIndex((card) => card.id === id);
  if (index < 0) return false;
  const [removed] = cards.splice(index, 1);
  await writeCards(cards);
  await unlink(path.join(imageRoot, removed.imageFile)).catch(() => undefined);
  return true;
}

export async function getImagePath(filename: string) {
  if (!/^[a-zA-Z0-9-]+\.jpg$/.test(filename)) return undefined;
  const cards = await readCards();
  if (!cards.some((card) => card.imageFile === filename)) return undefined;
  return path.join(imageRoot, filename);
}