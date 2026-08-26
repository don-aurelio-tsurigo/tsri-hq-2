/**
 * HQ Ad embed — drop-in for external sites (e.g. tsri.ch).
 *
 * Usage:
 *   <div data-hq-ad="article-top"></div>
 *   <script async src="https://tsri-hub.online/ads/embed.js"></script>
 *
 * Optional: data-api-base on the script tag to override API origin.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var apiBase = (
    (script && script.getAttribute("data-api-base")) ||
    (script && script.src ? new URL(script.src).origin : "") ||
    ""
  ).replace(/\/$/, "");

  if (!apiBase) return;

  var STYLE_ID = "hq-ad-embed-styles";
  var CSS =
    ".hq-ad-slot{display:block;width:100%;max-width:582px;box-sizing:border-box;container-name:hq-ad;container-type:inline-size}" +
    ".hq-ad-slot__wrapper{box-sizing:border-box;position:relative;width:100%;max-width:582px;overflow:hidden;border:0;border-radius:1cqw;background-color:#e1e4e8;padding:0 .5rem .5rem;opacity:0;transition:opacity .5s cubic-bezier(0,.5,.25,1) .6s}" +
    "@container hq-ad (min-width:480px){.hq-ad-slot__wrapper{padding:0 1.5rem 1.5rem}}" +
    ".hq-ad-slot--ready .hq-ad-slot__wrapper{opacity:1}" +
    ".hq-ad-slot__label{display:flex;align-items:center;width:100%;height:39px;color:#fff;font-family:\"Hanken Grotesk\",\"Hanken Grotesk Fallback\",sans-serif;font-size:.75rem;font-weight:600;letter-spacing:.01em;line-height:1;text-decoration:none;user-select:none}" +
    ".hq-ad-slot__label:hover{text-decoration:underline}" +
    ".hq-ad-slot__content{position:relative;width:100%;overflow:hidden;background:#fff;line-height:0}" +
    ".hq-ad-slot__media{display:block;width:100%;height:auto;border:0}" +
    ".hq-ad-slot__media--video{aspect-ratio:16/9;height:auto}" +
    ".hq-ad-slot__hit{position:absolute;inset:0;z-index:1}";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function vimeoId(url) {
    var match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return match ? match[1] : null;
  }

  function vimeoEmbedSrc(url) {
    if (url.indexOf("player.vimeo.com") !== -1) {
      return url + (url.indexOf("?") !== -1 ? "&" : "?") + "autoplay=1&muted=1&loop=1&background=1";
    }
    var id = vimeoId(url);
    if (id) {
      return (
        "https://player.vimeo.com/video/" +
        id +
        "?autoplay=1&muted=1&loop=1&background=1"
      );
    }
    return url;
  }

  function fetchVimeoAspectRatio(url) {
    var id = vimeoId(url);
    if (!id) return Promise.resolve(null);
    var page = "https://vimeo.com/" + id;
    return fetch(
      "https://vimeo.com/api/oembed.json?url=" + encodeURIComponent(page),
    )
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (
          data &&
          typeof data.width === "number" &&
          typeof data.height === "number" &&
          data.width > 0 &&
          data.height > 0
        ) {
          return data.width / data.height;
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  function track(creativeId, type) {
    var payload = JSON.stringify({ creativeId: creativeId, type: type });
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon(apiBase + "/api/ads/event", blob)) return;
      }
    } catch (e) {}
    fetch(apiBase + "/api/ads/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      mode: "cors",
    }).catch(function () {});
  }

  function render(el, data, videoAspect) {
    var aside = document.createElement("aside");
    aside.className = "hq-ad-slot";
    aside.setAttribute("data-ad-slot", el.getAttribute("data-hq-ad") || "article-top");
    aside.setAttribute("aria-label", "Anzeige");

    var wrapper = document.createElement("div");
    wrapper.className = "hq-ad-slot__wrapper";

    var label = document.createElement("a");
    label.className = "hq-ad-slot__label";
    label.href = "https://tsri.ch/werben";
    label.target = "_blank";
    label.rel = "noopener noreferrer";
    label.textContent = "Anzeige";

    var content = document.createElement("div");
    content.className = "hq-ad-slot__content";

    if (data.type === "VIDEO") {
      var iframe = document.createElement("iframe");
      iframe.className = "hq-ad-slot__media hq-ad-slot__media--video";
      iframe.src = vimeoEmbedSrc(data.mediaUrl);
      iframe.title = "Anzeige";
      iframe.allow = "autoplay; fullscreen; picture-in-picture";
      iframe.setAttribute("allowfullscreen", "");
      iframe.style.aspectRatio = String(videoAspect || 16 / 9);
      content.appendChild(iframe);
    } else {
      var img = document.createElement("img");
      img.className = "hq-ad-slot__media";
      img.src = data.mediaUrl;
      img.alt = "";
      content.appendChild(img);
    }

    var hit = document.createElement("a");
    hit.className = "hq-ad-slot__hit";
    hit.href = data.targetUrl;
    hit.rel = "noopener noreferrer sponsored";
    hit.setAttribute("aria-label", "Zur Anzeige");
    hit.addEventListener("click", function () {
      track(data.creativeId, "CLICK");
    });
    content.appendChild(hit);

    wrapper.appendChild(label);
    wrapper.appendChild(content);
    aside.appendChild(wrapper);

    el.innerHTML = "";
    el.appendChild(aside);

    requestAnimationFrame(function () {
      aside.classList.add("hq-ad-slot--ready");
    });

    track(data.creativeId, "IMPRESSION");
  }

  function mount(el) {
    if (el.getAttribute("data-hq-ad-mounted") === "1") return;
    el.setAttribute("data-hq-ad-mounted", "1");

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer =
      controller &&
      setTimeout(function () {
        controller.abort();
      }, 4000);

    fetch(apiBase + "/api/ads/serve", {
      cache: "no-store",
      mode: "cors",
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        if (res.status === 204 || !res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.creativeId || !data.mediaUrl) return null;
        if (data.type === "VIDEO") {
          return fetchVimeoAspectRatio(data.mediaUrl).then(function (ratio) {
            render(el, data, ratio);
          });
        }
        render(el, data, null);
      })
      .catch(function () {})
      .then(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function init() {
    injectStyles();
    var nodes = document.querySelectorAll("[data-hq-ad]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
