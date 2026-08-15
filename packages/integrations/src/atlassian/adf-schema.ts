import { z } from "zod";

const maximumAdfTextNodeCharacters = 50_000;
const nodeTypes = [
  "blockquote",
  "bulletList",
  "codeBlock",
  "hardBreak",
  "heading",
  "listItem",
  "orderedList",
  "paragraph",
  "rule",
  "table",
  "tableCell",
  "tableHeader",
  "tableRow",
  "text",
] as const;
const attributeValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string().max(2_048),
]);
const attributesSchema = z
  .record(z.string().max(100), attributeValueSchema)
  .refine((value) => Object.keys(value).length <= 10, {
    message: "ADF nodes may have at most 10 attributes.",
  });
const markSchema = z
  .object({
    attrs: attributesSchema.optional(),
    type: z.enum(["code", "em", "link", "strike", "strong"]),
  })
  .strict();

export interface AtlassianAdfNode {
  attrs?: Record<string, boolean | number | string> | undefined;
  content?: AtlassianAdfNode[] | undefined;
  marks?: z.infer<typeof markSchema>[] | undefined;
  text?: string | undefined;
  type: (typeof nodeTypes)[number];
}

export interface AtlassianAdfDocument {
  content: AtlassianAdfNode[];
  type: "doc";
  version: 1;
}

const nodeSchema: z.ZodType<AtlassianAdfNode> = z.lazy(() =>
  z
    .object({
      attrs: attributesSchema.optional(),
      content: z.array(nodeSchema).max(1_000).optional(),
      marks: z.array(markSchema).max(10).optional(),
      text: z.string().min(1).max(maximumAdfTextNodeCharacters).optional(),
      type: z.enum(nodeTypes),
    })
    .strict(),
);

const blockTypes = new Set<AtlassianAdfNode["type"]>([
  "blockquote",
  "bulletList",
  "codeBlock",
  "heading",
  "orderedList",
  "paragraph",
  "rule",
  "table",
]);
const containerChildren: Partial<
  Record<AtlassianAdfNode["type"], ReadonlySet<AtlassianAdfNode["type"]>>
> = {
  blockquote: blockTypes,
  bulletList: new Set(["listItem"]),
  codeBlock: new Set(["text"]),
  heading: new Set(["hardBreak", "text"]),
  listItem: blockTypes,
  orderedList: new Set(["listItem"]),
  paragraph: new Set(["hardBreak", "text"]),
  table: new Set(["tableRow"]),
  tableCell: blockTypes,
  tableHeader: blockTypes,
  tableRow: new Set(["tableCell", "tableHeader"]),
};

function safeLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateNode(
  node: AtlassianAdfNode,
  context: z.RefinementCtx,
  path: PropertyKey[],
  state: { characters: number; nodes: number },
  maximumCharacters: number,
  depth: number,
): void {
  state.nodes += 1;
  if (state.nodes > 2_000) {
    context.addIssue({
      code: "custom",
      message: "ADF documents may contain at most 2,000 nodes.",
      path,
    });
    return;
  }
  if (depth > 20) {
    context.addIssue({
      code: "custom",
      message: "ADF documents may be nested at most 20 levels.",
      path,
    });
    return;
  }

  if (node.type === "text") {
    state.characters += node.text?.length ?? 0;
    if (node.text === undefined || node.content !== undefined) {
      context.addIssue({
        code: "custom",
        message: "ADF text nodes require text and cannot contain child nodes.",
        path,
      });
    }
    for (const [index, mark] of (node.marks ?? []).entries()) {
      if (mark.type !== "link") continue;
      const href = mark.attrs?.href;
      if (typeof href !== "string" || !safeLink(href)) {
        context.addIssue({
          code: "custom",
          message: "ADF link marks require a safe HTTP or HTTPS href.",
          path: [...path, "marks", index, "attrs", "href"],
        });
      }
    }
  } else if (node.text !== undefined || node.marks !== undefined) {
    context.addIssue({
      code: "custom",
      message: "Only ADF text nodes may contain text or marks.",
      path,
    });
  }

  const children = node.content ?? [];
  const allowed = containerChildren[node.type];
  if (
    (allowed === undefined && children.length > 0) ||
    children.some((child) => allowed !== undefined && !allowed.has(child.type))
  ) {
    context.addIssue({
      code: "custom",
      message: `ADF ${node.type} contains an unsupported child node.`,
      path: [...path, "content"],
    });
  }
  if (allowed !== undefined && children.length === 0) {
    context.addIssue({
      code: "custom",
      message: `ADF ${node.type} requires content.`,
      path: [...path, "content"],
    });
  }
  if (node.type === "heading") {
    const level = node.attrs?.level;
    if (
      typeof level !== "number" ||
      !Number.isInteger(level) ||
      level < 1 ||
      level > 6
    ) {
      context.addIssue({
        code: "custom",
        message: "ADF headings require an integer level from 1 to 6.",
        path: [...path, "attrs", "level"],
      });
    }
  }
  if (state.characters > maximumCharacters) {
    context.addIssue({
      code: "custom",
      message: `ADF text may contain at most ${maximumCharacters.toLocaleString()} characters.`,
      path,
    });
    return;
  }
  for (const [index, child] of children.entries()) {
    validateNode(
      child,
      context,
      [...path, "content", index],
      state,
      maximumCharacters,
      depth + 1,
    );
  }
}

export function createAdfDocumentSchema(
  maximumCharacters: number,
): z.ZodType<AtlassianAdfDocument> {
  return z
    .object({
      content: z.array(nodeSchema).min(1).max(1_000),
      type: z.literal("doc"),
      version: z.literal(1),
    })
    .strict()
    .superRefine((document, context) => {
      const state = { characters: 0, nodes: 0 };
      for (const [index, node] of document.content.entries()) {
        if (!blockTypes.has(node.type)) {
          context.addIssue({
            code: "custom",
            message: `ADF ${node.type} cannot appear at the document root.`,
            path: ["content", index],
          });
        }
        validateNode(
          node,
          context,
          ["content", index],
          state,
          maximumCharacters,
          1,
        );
      }
    });
}
