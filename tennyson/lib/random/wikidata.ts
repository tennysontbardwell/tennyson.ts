import * as common from "tennyson/lib/core/common";
import * as common_node from "tennyson/lib/core/common-node";
import * as net_util from "tennyson/lib/core/net-util";

const endpoint = new URL("https://query.wikidata.org/sparql");

export async function wikidataQueryAndView(sparql: string) {
  const url = new URL(endpoint);
  url.searchParams.set("query", sparql);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/sparql-results+json",
    },
  });
  const data: any = await net_util.responseJsonExn(res);
  const processedData = data["results"]["bindings"].map((obj: any) =>
    common.mapEntries(obj, ([k, v]: any) => [k, v.value]),
  );
  await common_node.vdJson(processedData);
}

export const US_ISO_3166_2_Codes = `
SELECT ?item ?itemLabel ?code ?pop WHERE {
  ?item wdt:P300 ?code.
  OPTIONAL {
    ?item p:P1082 [ ps:P1082 ?pop; wikibase:rank wikibase:PreferredRank ].
  }

  FILTER(STRSTARTS(?code, "US-"))

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY ?code
`;

export const ISO_3166_2_Codes = `
SELECT ?item ?itemLabel ?code WHERE {
  ?item wdt:P300 ?code.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY ?code
`;

export const ISO_3166_1_Codes = `
SELECT DISTINCT ?item ?itemLabel ?alpha2Code ?alpha3Code ?numericCode WHERE {
  # Restrict to items that have at least one of the three properties
  ?item (wdt:P297|wdt:P298|wdt:P299) ?any .

  # These OPTIONALs generate all combinations of values per item
  OPTIONAL { ?item wdt:P297 ?alpha2Code . }
  OPTIONAL { ?item wdt:P298 ?alpha3Code . }
  OPTIONAL { ?item wdt:P299 ?numericCode . }

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY ?alpha2Code ?alpha3Code ?numericCode
`;

export const ISO_9362_SWIFT_BIC = `
SELECT ?item ?itemLabel ?code WHERE {
  ?item wdt:P2627 ?code.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY ?code
`

export const PHONE = `
SELECT ?item ?itemLabel ?code WHERE {
  ?item wdt:P474 ?code; wdt:P31 wd:Q6256.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY ?code
`
