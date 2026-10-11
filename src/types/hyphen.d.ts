declare module "hyphen/de-ch-1901" {
  export function hyphenateSync(
    text: string,
    options?: { hyphenChar?: string; minWordLength?: number },
  ): string;
}
