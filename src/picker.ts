import * as p from "@clack/prompts";
import { styleText } from "node:util";

export type PickerItem = {
  value: string;
  label: string;
  /** shown dim in parentheses next to the label, e.g. a path */
  hint?: string;
  /** a status note rendered with the label, e.g. "already installed" */
  annotation?: string;
};

export type PickerResult =
  | { outcome: "picked"; values: string[] }
  | { outcome: "cancelled" };

/**
 * Generic multi-select over labeled items. Submitting nothing or cancelling both count as
 * cancelled; required is off so an empty submission is representable. Clack's built-in
 * select-all on `a` applies as-is.
 */
export async function pickMany(options: {
  message: string;
  items: readonly PickerItem[];
}): Promise<PickerResult> {
  const choice = await p.multiselect({
    message: options.message,
    required: false,
    options: options.items.map((item) => ({
      value: item.value,
      label: item.annotation === undefined ? item.label : `${item.label} ${styleText("dim", `(${item.annotation})`)}`,
      ...(item.hint === undefined ? {} : { hint: item.hint }),
    })),
  });
  if (p.isCancel(choice) || choice.length === 0) {
    return { outcome: "cancelled" };
  }
  return { outcome: "picked", values: choice };
}
