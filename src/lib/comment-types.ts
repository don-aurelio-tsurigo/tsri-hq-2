/** Comment as sent to the client (articles and tasks share this shape). */
export type CommentView = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
  /** Set on replies: the thread start this answers. */
  parentId: string | null;
  /** Set on thread starts anchored to a text passage. */
  quote: string | null;
  resolvedAt: string | null;
  canDelete: boolean;
};

export type CommentListResult =
  | { error: string }
  | { comments: CommentView[]; viewer: { id: string; name: string } };
