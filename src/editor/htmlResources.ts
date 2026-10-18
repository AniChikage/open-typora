import DOMPurify from "dompurify";
// Keep the normal safe link protocols plus this app's document-scoped media
// scheme. File URLs are rewritten before sanitization, never enabled globally.
const allowedURI = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|open-typora-asset):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;
export function safeDocumentHtml(html: string, documentId?: string, block = true) {
  const template = document.createElement("template"); template.innerHTML = html;
  if (documentId) for (const element of template.content.querySelectorAll("img,video,audio,source")) {
    const source = element.getAttribute("src") || "";
    if (source && (!/^[a-z][a-z\d+.-]*:/i.test(source) || /^file:/i.test(source) || /^[a-z]:[\\/]/i.test(source))) {
      element.setAttribute("src",`open-typora-asset://local/${encodeURIComponent(documentId)}/${encodeURIComponent(source)}`);
    }
  }
  return DOMPurify.sanitize(template.innerHTML,{ALLOW_DATA_ATTR:false,FORBID_ATTR:["contenteditable"],ALLOWED_URI_REGEXP:allowedURI,...(block ? {ADD_TAGS:["video","audio","source","iframe"],ADD_ATTR:["allowfullscreen","sandbox"]} : {})});
}
