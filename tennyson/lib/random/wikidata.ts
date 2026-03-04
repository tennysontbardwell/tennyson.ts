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

// type Prop = { propId: string; propDisplayName: string };
// function allInstancesOf(
//   all: Prop[],
//   oneOf: Prop[],
//   optional: Prop[],
//   orderBy: string[],
// ) {
//   const selectStm = (() => {
//     const names = [all, oneOf, optional]
//       .flat()
//       .map((x) => `?${x.propDisplayName}`)
//       .join(" ");
//     return `SELECT DISTINCT ?item ?itemLabel ${names} WHERE {`;
//   })();
//   const allStms = all.map(
//     ({ propId, propDisplayName }) => `?item wdt:${propId} ?${propDisplayName}.`,
//   );

//   const oneOfHead = (() => {
//     const lst = oneOf.map((x) => `wdt:${x.propId}`).join("|");
//     return oneOf.length > 0 ? [`?item (${lst}) ?any .`] : [];
//   })();

//   const oneOfStms = [...oneOf, ...optional].map(
//     ({ propId, propDisplayName }) =>
//       `OPTIONAL { ?item wdt:${propId} ?${propDisplayName}. }`,
//   );

//   const tail = [
//     'SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }',
//     "}",
//   ];

//   const orderByStm = (() => {
//     const names = orderBy.map((x) => `?${x}`).join(" ");
//     return orderBy.length > 0 ? [`ORDER BY ${names}`] : [];
//   })();

//   return [
//     selectStm,
//     ...allStms,
//     ...oneOfHead,
//     ...oneOfStms,
//     ...tail,
//     ...orderByStm,
//   ].join("\n");
// }

export const QUERIES = {
  ISO_3166_2_US_States: `
SELECT ?item ?itemLabel ?code ?pop WHERE {
  ?item wdt:P300 ?code.
  OPTIONAL {
    ?item p:P1082 [ ps:P1082 ?pop; wikibase:rank wikibase:PreferredRank ].
  }

  FILTER(STRSTARTS(?code, "US-"))

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY ?code
`,

  ISO_3166_2_Country_Subdivision_Codes: `
SELECT ?item ?itemLabel ?code WHERE {
  ?item wdt:P300 ?code.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY ?code
`,
  // export const ISO_3166_2_Codes = allInstancesOf(
  //   [{ propId: "P300", propDisplayName: "code" }],
  //   [],
  //   [],
  //   ["code"],
  // );

  ISO_3166_1_Country_Codes: `
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
`,

  ISO_9362_SWIFT_BIC: `
SELECT ?item ?itemLabel ?code WHERE {
  ?item wdt:P2627 ?code.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY ?code
`,

  US_Phone_Area_Codes: `
SELECT ?item ?itemLabel ?code WHERE {
  ?item wdt:P474 ?code; wdt:P31 wd:Q6256.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY ?code
`,
  ISO_4217_Currency_Codes: `
SELECT ?item ?itemLabel ?code ?issuerLabel WHERE {
  ?item wdt:P498 ?code.
  OPTIONAL { ?item wdt:P562 ?issuer. }
  # ?item p:P498 [ ps:P498 ?code; wikibase:rank wikibase:PreferredRank ].
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
ORDER BY ?code
`,
};
