// GitHub issue/comment listings may span multiple 100-item pages.
// Fail closed if the listing is malformed or exceeds the bounded search;
// otherwise the monitor could create duplicate incidents or repeat comments.
export async function listMonitorItems(api, path, maxPages = 20) {
  const all = [];
  const join = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= maxPages; page++) {
    const items = await api(`${path}${join}per_page=100&page=${page}`);
    if (!Array.isArray(items)) throw Error("invalid_monitor_listing");
    all.push(...items);
    if (items.length < 100) return all;
  }
  throw Error("monitor_listing_page_limit");
}
