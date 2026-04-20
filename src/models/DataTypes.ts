/**
 * Canonical book identifier used across generated data files.
 *
 * Examples:
 * - GENESIS
 * - 1 KINGS
 * - SONG SOLOMON
 */
export type DataBookName = string;

/**
 * Basic reference to a single verse location.
 *
 * Notes:
 * - chapter and verse numbers are 1-based (not 0-based)
 * - book values are expected to align with translation JSON keys
 */
export type DataVerseRef = {
  /** Book identifier in canonical uppercase style. */
  book: DataBookName;
  /** 1-based chapter number within the book. */
  chapter: number;
  /** 1-based verse number within the chapter. */
  verse: number;
};

/**
 * Verse reference plus its verse text payload.
 */
export type DataVerseRefWithText = DataVerseRef & {
  /** Raw verse text as loaded from translation data. */
  text: string;
};

/**
 * Verse selected as one of the nearest examples to a topic centroid.
 */
export type DataTopicCenterVerse = DataVerseRefWithText & {
  /**
   * Squared distance from this verse vector to the computed topic center.
   * Lower values indicate a more representative verse for that topic.
   */
  distance: number;
};

/**
 * A single topic entry inside bible-topic-centers.json.
 */
export type DataTopicCentersTopic = {
  /** Integer topic identifier assigned by clustering. */
  topic: number;
  /** Number of verses assigned to this topic cluster. */
  size: number;
  /** Representative verses nearest to the cluster center. */
  centerVerses: DataTopicCenterVerse[];
};

/**
 * Output schema for data/bible-topic-centers.json.
 */
export type DataTopicCentersFile = {
  /** Embedding provider name used during generation. */
  provider: string;
  /** Embedding model name used during generation. */
  model: string;
  /** Number of center verses retained per topic. */
  centerCount: number;
  /** Whether PCA dimensionality reduction was enabled before clustering. */
  pcaEnabled: boolean;
  /**
   * PCA dimensionality used when enabled.
   * Null means no reduction was applied.
   */
  pcaComponents: number | null;
  /** Topic entries generated from clustering output. */
  topics: DataTopicCentersTopic[];
};

/**
 * A topic center entry enriched with an LLM-generated label and description.
 */
export type DataTopicLabelsTopic = DataTopicCentersTopic & {
  /** Short human-readable topic label. */
  label: string;
  /** One-sentence summary describing the shared theme. */
  description: string;
};

/**
 * Output schema for data/bible-topic-labels.json.
 */
export type DataTopicLabelsFile = {
  /** Labeling provider used for topic naming. */
  provider: string;
  /** Labeling model used for topic naming. */
  model: string;
  /** Labeled topic entries. */
  topics: DataTopicLabelsTopic[];
};

/**
 * Verse-to-topic assignment entry.
 */
export type DataVerseTopicEntry = DataVerseRef & {
  /** Integer topic identifier for this verse. */
  topic: number;
};

/**
 * Output schema for data/bible-verse-topics.json.
 */
export type DataVerseTopicsFile = DataVerseTopicEntry[];

/**
 * A single chapter point for 2D Bible map rendering.
 */
export type DataMapPoint = {
  /** Book identifier for this chapter point. */
  book: DataBookName;
  /** 1-based chapter number. */
  chapter: number;
  /** Horizontal map coordinate produced by UMAP. */
  x: number;
  /** Vertical map coordinate produced by UMAP. */
  y: number;
  /** K-means cluster assignment used for coloring/grouping. */
  cluster: number;
};

/**
 * Output schema for data/bible-map-umap.json.
 */
export type DataMapUmapFile = DataMapPoint[];

/**
 * Recursive parsed Nave topic node.
 */
export type DataNaveTopic = {
  /** Topic title. */
  title: string;
  /** Nested child topics. */
  subtopics: DataNaveTopic[];
  /** Verse references attached to this topic node. */
  verses: string[];
  /** Related topic titles associated with this node. */
  relatedTopics: string[];
};

/**
 * Output schema for data/parsed-nave.json.
 */
export type DataParsedNaveFile = DataNaveTopic[];

/**
 * A chapter array from translation data.
 *
 * Convention:
 * - index 0 is typically null
 * - verses begin at index 1
 */
export type DataBibleChapter = Array<string | null>;

/**
 * A book array from translation data.
 *
 * Convention:
 * - index 0 may be null or a book title string (for example ASV)
 * - chapter arrays begin at index 1
 */
export type DataBibleBook = Array<DataBibleChapter | string | null>;

/**
 * Full translation file shape keyed by book name.
 *
 * This models files like:
 * - data/translations/KJV.json
 * - data/translations/ASV.json
 * - data/translations/YLT.json
 */
export type DataBibleTranslationFile = Record<DataBookName, DataBibleBook>;
