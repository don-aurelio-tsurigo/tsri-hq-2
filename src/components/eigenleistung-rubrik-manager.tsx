"use client";

import {
  createEigenleistungRubrik,
  deleteEigenleistungRubrik,
  updateEigenleistungRubrik,
} from "@/lib/actions";
import {
  TaxonomyBadge,
  TaxonomyManager,
  type TaxonomyOption,
} from "@/components/taxonomy-manager";

export type RubrikOption = TaxonomyOption;

export function EigenleistungRubrikManager({
  rubriken,
  onClose,
}: {
  rubriken: RubrikOption[];
  onClose: () => void;
}) {
  return (
    <TaxonomyManager
      title="Eigenleistungs-Rubriken"
      description="Name und Farbe sind editierbar."
      items={rubriken}
      newLabel="Neue Rubrik"
      createAction={createEigenleistungRubrik}
      updateAction={updateEigenleistungRubrik}
      deleteAction={deleteEigenleistungRubrik}
      onClose={onClose}
    />
  );
}

export function RubrikBadge({
  name,
  color,
}: {
  name: string;
  color: string;
}) {
  return <TaxonomyBadge name={name} color={color} />;
}
