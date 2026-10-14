import {
  StreamLanguage,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from "@codemirror/language";
import { javascript } from "@codemirror/legacy-modes/mode/javascript";
import { python } from "@codemirror/legacy-modes/mode/python";
import { css } from "@codemirror/legacy-modes/mode/css";
import { xml } from "@codemirror/legacy-modes/mode/xml";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { stex } from "@codemirror/legacy-modes/mode/stex";
export function fenceLanguage(language: string) {
  const mode = /^(js|jsx|javascript|ts|typescript|json)$/.test(language)
    ? javascript
    : /^(py|python)$/.test(language)
      ? python
      : /^(html|xml|svg)$/.test(language)
        ? xml
        : /^(sh|bash|shell)$/.test(language)
          ? shell
          : /^(ya?ml)$/.test(language)
            ? yaml
            : /^(tex|latex|math)$/.test(language)
              ? stex
              : language === "css"
                ? css
                : null;
  return [
    mode ? StreamLanguage.define(mode) : [],
    syntaxHighlighting(defaultHighlightStyle),
    bracketMatching(),
  ];
}
