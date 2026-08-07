"use client";

import {
  createArticleCategory,
  deleteArticleCategory,
  updateArticleCategory,
} from "@/lib/actions";
import {
  TaxonomyManager,
  type TaxonomyOption,
} from "@/components/taxonomy-manager";

export type CategoryOption = TaxonomyOption;

export function ArticleCategoryManager({
  categories,
  onClose,
}: {
  categories: CategoryOption[];
  onClose: () => void;
}) {
  return (
    <TaxonomyManager
      title="Kategorien"
      description="Redaktions-Kategorien für Filter und Programm. Name und Farbe sind editierbar."
      items={categories}
      newLabel="Neue Kategorie"
      createAction={createArticleCategory}
      updateAction={updateArticleCategory}
      deleteAction={deleteArticleCategory}
      onClose={onClose}
    />
  );
}
