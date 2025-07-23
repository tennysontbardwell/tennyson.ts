import React from 'react';
import type { JSX } from 'react';
import type { RangerItem } from './Ranger';

async function fetchDirectoryListing(url: string): Promise<Array<RangerItem>> {
  try {
    const response = await fetch(url);
    const html = await response.text();

    // Parse HTML to extract file/directory links
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a[href]'));

    const items: Array<RangerItem> = [];

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href || href === '../') continue;

      // Remove @ suffix from filenames
      const name = href.replace(/@$/, '').replace(/\/+/g, '/');
      const itemUrl = `${url}/${name}`;

      console.log({ itemUrl });
      items.push({
        name,
        subitems: async () => {
          console.log({ msg: "sub", itemUrl });
          try {
            const subResponse = await fetch(itemUrl);
            const contentType = subResponse.headers.get('content-type') || '';

            if (contentType.includes('text/html')) {
              return await fetchDirectoryListing(itemUrl);
            }
            return [];
          } catch {
            return [];
          }
        },
        display: () => {
          return <ItemDisplay url={itemUrl} />;
        }
      });
    }

    return items;
  } catch (error) {
    console.error('Failed to fetch directory listing:', error);
    return [];
  }
}

function ItemDisplay({ url }: { url: string }) {
  const [content, setContent] = React.useState<JSX.Element>(<div>Loading...</div>);

  React.useEffect(() => {
    console.log({ msg: "display", url });
    fetch(url)
      .then(async response => {
        const contentType = response.headers.get('content-type') || '';

        if (contentType.startsWith('image/')) {
          setContent(<img src={url} alt="Preview" style={{ objectFit: 'contain', height: "100%", width: "100%" }} />);
        }
        else if (contentType.startsWith("video/")) {
          setContent(<video controls autoPlay src={url} style={{ objectFit: 'contain', height: "100%", width: "100%" }} />);
        }
        else {
          setContent(<div></div>);
        }
      })
      .catch(() => {
        setContent(<div></div>);
      });
  }, [url]);

  return content;
}

export async function fetchFileSystem(): Promise<Array<RangerItem>> {
  return await fetchDirectoryListing('http://localhost:5173/api');
}
