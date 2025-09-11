import { expect, test } from "vitest";

// import { xpathOfHTML } from "./scraper";

const html = `
    <html>
      <body>
        <div id="test">Hello World</div>
        <ul>
          <li>Item One</li>
          <li>Item Two</li>
        </ul>
      </body>
    </html>
  `;

test("placeholder", async () => {});

// test("cssSelectorOfHTML", async () => {
//   const frag = JSDOM.fragment(html)
//   const get = (xpath: string) => {
//     const res = frag.querySelectorAll(xpath)
//     return expect(res)
//   }

//   get('#test')
//     .toMatchInlineSnapshot(`
//       NodeList [
//         <div
//           id="test"
//         >
//           Hello World
//         </div>,
//       ]
//     `);

//   get('li:first-child')
//     .toMatchInlineSnapshot(`
//       NodeList [
//         <li>
//           Item One
//         </li>,
//       ]
//     `);

//   get('li:nth-child(2)')
//     .toMatchInlineSnapshot(`
//       NodeList [
//         <li>
//           Item Two
//         </li>,
//       ]
//     `);

//   get('li')
//     .toMatchInlineSnapshot(`
//       NodeList [
//         <li>
//           Item One
//         </li>,
//         <li>
//           Item Two
//         </li>,
//       ]
//     `);
// });

// test("xpathOfHTML", async () => {
//   const get = async (xpath: string) => {
//     const res = await xpathOfHTML(html, xpath)
//     return expect(res.stringValue)
//   }

//   (await get('string(//div[@id="test"])'))
//     .toMatchInlineSnapshot(`"Hello World"`);
//   (await get('//li[1]'))
//     .toMatchInlineSnapshot(`"Item One"`);
//   (await get('//li[2]'))
//     .toMatchInlineSnapshot(`"Item Two"`);

//   const dom = new JSDOM(html)
//   expect(dom.window.document.querySelectorAll("li"))
//     .toMatchInlineSnapshot(`
//       NodeList [
//         <li>
//           Item One
//         </li>,
//         <li>
//           Item Two
//         </li>,
//       ]
//     `)
// });
