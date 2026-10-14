import { mathjax } from "@mathjax/src/mjs/mathjax.js";
import { TeX } from "@mathjax/src/mjs/input/tex.js";
import { SVG } from "@mathjax/src/mjs/output/svg.js";
import { browserAdaptor } from "@mathjax/src/mjs/adaptors/browserAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/mjs/handlers/html.js";
import { MathJaxNewcmFont } from "@mathjax/mathjax-newcm-font/js/svg.js";
import "@mathjax/src/mjs/input/tex/base/BaseConfiguration.js";
import "@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/mjs/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/mjs/input/tex/configmacros/ConfigMacrosConfiguration.js";
import "@mathjax/src/mjs/input/tex/textmacros/TextMacrosConfiguration.js";
import "@mathjax/src/mjs/input/tex/color/ColorConfiguration.js";
import "@mathjax/src/mjs/input/tex/mathtools/MathtoolsConfiguration.js";
import "@mathjax/src/mjs/input/tex/mhchem/MhchemConfiguration.js";
import "@mathjax/src/mjs/input/tex/noerrors/NoErrorsConfiguration.js";
import "@mathjax/src/mjs/input/tex/noundefined/NoUndefinedConfiguration.js";
const fonts = import.meta.glob(
  "../../node_modules/@mathjax/mathjax-newcm-font/mjs/svg/dynamic/*.js",
);
mathjax.asyncLoad = async (name: string) => {
  const suffix = `/svg/dynamic/${name.split("/").at(-1)!.replace(/\.js$/, "")}.js`;
  const entry = Object.entries(fonts).find(([path]) => path.endsWith(suffix));
  if (!entry) throw new Error("公式需要尚未支持的扩展。");
  return entry[1]();
};
const adaptor = browserAdaptor();
RegisterHTMLHandler(adaptor);
export function createMathDocument() {
  return mathjax.document(document, {
    InputJax: new TeX({
      packages: [
        "base",
        "ams",
        "newcommand",
        "configmacros",
        "textmacros",
        "color",
        "mathtools",
        "mhchem",
        "noerrors",
        "noundefined",
      ],
    }),
    OutputJax: new SVG({ fontCache: "none", font: new MathJaxNewcmFont() }),
  });
}
