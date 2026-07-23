interface ExtractedHeading {
  id: string;
  content: string;
  depth: number;
}

interface ExtractedContent {
  heading?: string;
  content: string;
}

interface StructureResult {
  headings: ExtractedHeading[];
  contents: ExtractedContent[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function extractStructure(markdown: string): StructureResult {
  const headings: ExtractedHeading[] = [];
  const contents: ExtractedContent[] = [];
  let currentHeading: string | undefined;
  let currentContent: string[] = [];
  let inCodeBlock = false;

  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      currentContent.push(line);
      continue;
    }

    if (inCodeBlock) {
      currentContent.push(line);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/);
    if (headingMatch) {
      if (currentContent.length > 0) {
        const text = currentContent.join("\n").trim();
        if (text) {
          contents.push({ heading: currentHeading, content: text });
        }
        currentContent = [];
      }

      const depth = headingMatch[1]!.length;
      const text = headingMatch[2]!.trim();
      const id = slugify(text);
      headings.push({ id, content: text, depth });
      currentHeading = text;
      continue;
    }

    currentContent.push(line);
  }

  if (currentContent.length > 0) {
    const text = currentContent.join("\n").trim();
    if (text) {
      contents.push({ heading: currentHeading, content: text });
    }
  }

  return { headings, contents };
}
