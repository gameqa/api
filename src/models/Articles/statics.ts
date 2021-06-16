import {
	ArticlesCollectionInterface,
	ArticleSourceIdentifier,
	ArticleSources,
} from "../";
import { ArticlePreview } from "./interface";
import { ScraperFactory } from "./ScrapingService";
import Google from "./GoogleSearchApi";

export const findArticleByUrl = async function (
	this: ArticlesCollectionInterface,
	decodedURL: string,
	upsert?: boolean
) {
	const identifier = ArticleSources.getIdentifier(decodedURL);
	const key = ArticleSources.getArticleKey(decodedURL);
	const source = await ArticleSources.findOne({ identifier });
	return await this.findArticleByKey(identifier, key, upsert);
};

export const findArticleByKey = async function (
	this: ArticlesCollectionInterface,
	identifier: ArticleSourceIdentifier,
	key: string,
	upsert?: boolean
) {
	const source = await ArticleSources.findOne({ identifier });
	if (!source)
		throw new Error(`No article source found with identifier ${identifier}`);
	const doc = await this.findOne({ key, sourceId: source._id });
	if (doc) return doc;
	const scrapeData = await new ScraperFactory(identifier, key).scrapeArticle();
	const article = new this({
		title: scrapeData.title,
		paragraphs: scrapeData.paragraphs,
		extract: scrapeData.extract,
		sourceId: source._id,
		key,
	});
	await article.getSource();
	if (upsert) await article.save();
	return article;
};

export const webSearch = async function (
	this: ArticlesCollectionInterface,
	query: string
): Promise<ArticlePreview[]> {
	const items = await Google.search(query);
	console.log("About to get the urls");
	const urls = items.map((item) => item.link);
	console.log("Here are the urls", urls);
	const identifiers = urls.map((url) => ArticleSources.getIdentifier(url));
	console.log("Here are the identifiers", identifiers);
	const keys = urls.map((url) => ArticleSources.getArticleKey(url));
	console.log("Here are the keys", keys);
	const sources = await Promise.all(
		identifiers.map((identifier) => ArticleSources.findOne({ identifier }))
	);
	console.log("sources", sources);
	const returnFormattedItems: ArticlePreview[] = items.map((item, i) => ({
		url: item.link,
		snippet: item.snippet,
		title: item.title,
		source: sources[i],
		key: keys[i],
	}));
	console.log("returnFormattedItems", returnFormattedItems);
	const scrapedArticles = await Promise.all(
		returnFormattedItems.map((item) => {
			return this.findArticleByUrl(item.url);
		})
	);
	console.log("scrapedArticles", scrapedArticles);

	return returnFormattedItems.filter((_, i) => {
		return (
			!!scrapedArticles[i] &&
			scrapedArticles[i].paragraphs.join("").trim().length > 0
		);
	});
};
