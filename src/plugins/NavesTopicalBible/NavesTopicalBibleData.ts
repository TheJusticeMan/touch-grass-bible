import { VerseRef } from "../../VerseRef";

export type NaveTopic = {
  title: string;
  subtopics: NaveTopic[];
  verses: string[];
  relatedTopics: string[];
};

type VerseLocation = {
  book: string;
  chapter: number;
  verse: number;
};

type ParsedReferencePart = {
  book: string;
  chapter?: number;
  verse?: number;
};

type NaveReferenceRange = {
  start: VerseLocation;
  end: VerseLocation;
};

export type NaveTopicNode = {
  id: string;
  title: string;
  path: string[];
  fullTitle: string;
  depth: number;
  parentId: string | null;
  childIds: string[];
  verses: string[];
  relatedTopics: string[];
};

export type NaveIndex = {
  nodes: NaveTopicNode[];
  rootIds: string[];
  nodeById: Map<string, NaveTopicNode>;
  topLevelByTitle: Map<string, NaveTopicNode>;
};

function getBookForCode(bookCode: string): string | null {
  const bookIndex = VerseRef.BookShortNames.indexOf(bookCode);
  return bookIndex === -1 ? null : VerseRef.booksOfTheBible[bookIndex];
}

function parseReferencePart(reference: string): ParsedReferencePart | null {
  const [bookCode, chapterText, verseText] = reference.split(".");
  const book = getBookForCode(bookCode);

  if (!book) return null;

  return {
    book,
    chapter: chapterText ? Number.parseInt(chapterText, 10) : undefined,
    verse: verseText ? Number.parseInt(verseText, 10) : undefined,
  };
}

function getChapterCount(book: string): number {
  return Math.max((VerseRef.bible?.[book]?.length ?? 2) - 1, 1);
}

function getVerseCount(book: string, chapter: number): number {
  return Math.max((VerseRef.bible?.[book]?.[chapter]?.length ?? 2) - 1, 1);
}

function toBoundaryLocation(part: ParsedReferencePart, boundary: "start" | "end"): VerseLocation {
  const chapter = part.chapter ?? (boundary === "start" ? 1 : getChapterCount(part.book));
  const verse = part.verse ?? (boundary === "start" ? 1 : getVerseCount(part.book, chapter));

  return {
    book: part.book,
    chapter,
    verse,
  };
}

function compareLocations(left: VerseLocation, right: VerseLocation): number {
  return (
    VerseRef.booksOfTheBible.indexOf(left.book) - VerseRef.booksOfTheBible.indexOf(right.book) ||
    left.chapter - right.chapter ||
    left.verse - right.verse
  );
}

function toVerseLocation(verse: VerseRef): VerseLocation {
  return {
    book: verse.book,
    chapter: verse.chapter,
    verse: verse.verse,
  };
}

export function buildNaveIndex(topics: NaveTopic[]): NaveIndex {
  const nodes: NaveTopicNode[] = [];
  const nodeById = new Map<string, NaveTopicNode>();
  const topLevelByTitle = new Map<string, NaveTopicNode>();
  const rootIds: string[] = [];

  const visit = (topic: NaveTopic, path: string[], parentId: string | null): NaveTopicNode => {
    const fullPath = [...path, topic.title];
    const id = fullPath.join(" > ");
    const node: NaveTopicNode = {
      id,
      title: topic.title,
      path: fullPath,
      fullTitle: id,
      depth: path.length,
      parentId,
      childIds: [],
      verses: [...topic.verses],
      relatedTopics: [...topic.relatedTopics],
    };

    nodes.push(node);
    nodeById.set(node.id, node);

    if (parentId === null) {
      rootIds.push(node.id);
      topLevelByTitle.set(node.title.toUpperCase(), node);
    }

    node.childIds = topic.subtopics.map(subtopic => visit(subtopic, fullPath, node.id).id);

    return node;
  };

  topics.forEach(topic => visit(topic, [], null));

  return {
    nodes,
    rootIds,
    nodeById,
    topLevelByTitle,
  };
}

export function parseNaveReference(reference: string): NaveReferenceRange | null {
  const [startText, endText] = reference.split("-");
  const startPart = parseReferencePart(startText);
  const endPart = parseReferencePart(endText ?? startText);

  if (!startPart || !endPart) return null;

  return {
    start: toBoundaryLocation(startPart, "start"),
    end: toBoundaryLocation(endPart, "end"),
  };
}

export function getReferenceStartVerse(reference: string): VerseRef | null {
  const parsed = parseNaveReference(reference);

  if (!parsed) return null;

  return new VerseRef(parsed.start.book, parsed.start.chapter, parsed.start.verse);
}

export function referenceContainsVerse(reference: string, verse: VerseRef): boolean {
  const parsed = parseNaveReference(reference);

  if (!parsed) return false;

  const verseLocation = toVerseLocation(verse);
  return (
    compareLocations(parsed.start, verseLocation) <= 0 && compareLocations(verseLocation, parsed.end) <= 0
  );
}

export function getChildTopics(index: NaveIndex, topic: NaveTopicNode): NaveTopicNode[] {
  return topic.childIds
    .map(childId => index.nodeById.get(childId))
    .filter((childTopic): childTopic is NaveTopicNode => childTopic !== undefined);
}

export function getRelatedTopics(index: NaveIndex, topic: NaveTopicNode): NaveTopicNode[] {
  return topic.relatedTopics
    .map(relatedTopic => index.topLevelByTitle.get(relatedTopic.toUpperCase()))
    .filter((relatedNode): relatedNode is NaveTopicNode => relatedNode !== undefined);
}

export function findTopicsForVerse(index: NaveIndex, verse: VerseRef): NaveTopicNode[] {
  return index.nodes
    .filter(topic => topic.verses.some(reference => referenceContainsVerse(reference, verse)))
    .sort((left, right) => left.depth - right.depth || left.fullTitle.localeCompare(right.fullTitle));
}
