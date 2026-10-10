/**
 * Optional Cloudflare Worker wrapper for a Pages-style static deployment.
 * The transfer itself is peer-to-peer through QR codes; no file is sent here.
 */
export default {
  async fetch(request, env) {
    if (env?.ASSETS) return env.ASSETS.fetch(request);
    return new Response("OneCode QR transfer is a static site. Deploy the files with Cloudflare Pages.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
