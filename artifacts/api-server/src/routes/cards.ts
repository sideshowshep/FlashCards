import { Router, type IRouter } from "express";
import {
  CreateCardBody,
  CreateCardResponse,
  DeleteCardParams,
  GetCardsSummaryResponse,
  GetRandomCardQueryParams,
  GetRandomCardResponse,
  ListCardsQueryParams,
  ListCardsResponse,
  UpdateCardBody,
  UpdateCardParams,
  UpdateCardResponse,
} from "@workspace/api-zod";
import {
  createCard,
  deleteCard,
  getImagePath,
  getRandomCard,
  getSummary,
  listCards,
  updateCard,
} from "../lib/card-store";

const router: IRouter = Router();

function publicCard(card: Awaited<ReturnType<typeof createCard>>) {
  const { imageFile: _imageFile, ...result } = card;
  return result;
}

router.get("/cards/images/:filename", async (req, res, next) => {
  try {
    const imagePath = await getImagePath(req.params.filename);
    if (!imagePath) {
      res.status(404).json({ error: "Image not found" });
      return;
    }
    res.sendFile(imagePath);
  } catch (error) {
    next(error);
  }
});

router.get("/cards/summary", async (_req, res, next) => {
  try {
    res.json(GetCardsSummaryResponse.parse(await getSummary()));
  } catch (error) {
    next(error);
  }
});

router.get("/cards/random", async (req, res, next) => {
  try {
    const params = GetRandomCardQueryParams.parse(req.query);
    const card = await getRandomCard(params.category);
    if (!card) {
      res.status(404).json({ error: "No cards found" });
      return;
    }
    res.json(GetRandomCardResponse.parse(publicCard(card)));
  } catch (error) {
    next(error);
  }
});

router.get("/cards", async (req, res, next) => {
  try {
    const params = ListCardsQueryParams.parse(req.query);
    res.json(ListCardsResponse.parse((await listCards(params.category)).map(publicCard)));
  } catch (error) {
    next(error);
  }
});

router.post("/cards", async (req, res, next) => {
  try {
    const body = CreateCardBody.parse(req.body);
    const card = await createCard(body);
    res.status(201).json(CreateCardResponse.parse(publicCard(card)));
  } catch (error) {
    next(error);
  }
});

router.patch("/cards/:id", async (req, res, next) => {
  try {
    const params = UpdateCardParams.parse(req.params);
    const body = UpdateCardBody.parse(req.body);
    const card = await updateCard(params.id, body);
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.json(UpdateCardResponse.parse(publicCard(card)));
  } catch (error) {
    next(error);
  }
});

router.delete("/cards/:id", async (req, res, next) => {
  try {
    const params = DeleteCardParams.parse(req.params);
    if (!(await deleteCard(params.id))) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;