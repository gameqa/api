import { Schema, model } from "mongoose";
import {
	PrizeCategoriesInterface,
	PrizeCategoriesCollections,
} from "./interface";

const prizeCategoriesSchema = new Schema({
	name: {
		type: String,
		required: true,
	},
	lockedImg: {
		type: String,
		required: true,
	},
	unlockedImg: {
		type: String,
		required: true,
	},
	requiredLvl: {
		type: Number,
		required: true,
	},
});

export const PrizeCategories = model<
	PrizeCategoriesInterface,
	PrizeCategoriesCollections
>("prizeCategories", prizeCategoriesSchema, "prizeCategories");
