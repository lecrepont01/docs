import {
  Td, Thead, Th, Tr, Tbody, Table,
} from '@chakra-ui/react';
import React from 'react';

import { MdxNodeJsxElement } from '../@types/mdxast';
import { OptionDefinition } from '../components/ConfigOptions';
import InlineCode from '../components/InlineCode';
import { OptionsTableBase } from '../components/OptionsTable';
import PullRequestAttributesTable from '../components/PullRequestAttributesTable';
import RelativeLink from '../components/RelativeLink';

interface TableType {
  node: string;
  data: string | null;
  content: string | null;
}

export function stripHtmlFromkeys(jsonObject: any) {
  let stripped: any = {};
  if (typeof jsonObject === 'string') {
    return jsonObject;
  }

  if (Array.isArray(jsonObject)) {
    stripped = jsonObject.map(stripHtmlFromkeys);
  } else {
    Object.entries(jsonObject).forEach(([key, value]) => {
      const strippedKey = key.replace(/<\/?em>/g, '');

      if (Array.isArray(value)) {
        stripped[strippedKey] = value.map(stripHtmlFromkeys);
      } else if (typeof value === 'object') {
        stripped[strippedKey] = stripHtmlFromkeys(value);
      } else {
        stripped[strippedKey] = value;
      }
    });
  }

  return stripped;
}

function removeOptionsWithoutHighlight(
  options:
  | {
    [optionKey: string]: OptionDefinition;
  }
  | OptionDefinition[],
) {
  let cleanOptions = {};

  if (Array.isArray(options)) {
    cleanOptions = options.filter((option) => JSON.stringify(option).includes('<em>'));
  } else {
    Object.entries(options).forEach(([key, definition]) => {
      if (JSON.stringify(definition).includes('<em>')) {
        cleanOptions[key] = definition;
      }
    });
  }

  return cleanOptions;
}

function extractHighlightsFromText(text: string | null) {
  if (!text) return [];

  const highlights = [];

  const regex = /<em>(.*?)<\/em>/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    highlights.push(match[1]);
  }

  return highlights;
}

/**
 * Sometimes, Algolia will add <em> tags aroung escaped characters like: \n ==> \<em>n</em>.
 * We need to prevent this, otherwise JSON.parse will throw an error
 */
function unhighlightEscapedCharacters(str: string): string {
  return str.replaceAll(/\\<em>(.*?)<\/em>/g, '\\$1');
}

export function renderMdxTable(table: TableType) {
  const node = JSON.parse(unhighlightEscapedCharacters(table.node)) as MdxNodeJsxElement;
  const highlights = [...new Set(extractHighlightsFromText(table.content))];

  const data = table.data
    ? (stripHtmlFromkeys(JSON.parse(unhighlightEscapedCharacters(table.data))) as {
      [optionKey: string]: OptionDefinition;
    })
    : {};
  const onlyHighlightedOptions = removeOptionsWithoutHighlight(data) as any;

  if (node.name === 'Table') { return renderMdxRawTable(node, highlights).element; }
  if (Object.keys(onlyHighlightedOptions).length === 0) {
    // return nothing if table is empty
    return '';
  }

  switch (node.name) {
    case 'OptionsTable': {
      return OptionsTableBase(onlyHighlightedOptions);
    }

    case 'PullRequestAttributesTable': {
      return <PullRequestAttributesTable staticAttributes={onlyHighlightedOptions} />;
    }

    case 'ActionOptionsTable': {
      return OptionsTableBase(onlyHighlightedOptions);
    }
  }

  return '';
}

const components = {
  Td,
  Thead,
  Th,
  Tr,
  Table,
  Tbody,
  paragraph: 'p',
  strong: 'strong',
  inlineCode: InlineCode,
  link: (props: any) => (
    <RelativeLink href={props.node.url} title={props.node.title}>
      {props.children}
    </RelativeLink>
  ),
};

const highlightText = (text: string, highlights: string[]) => {
  let highlightedText = text;

  highlights.forEach((highlight) => {
    highlightedText = highlightedText.replaceAll(highlight, `<em>${highlight}</em>`);
  });

  return highlightedText;
};

function renderHighlightText(text: string) {
  const splitText = [];
  let lastMatchIndex = 0;

  for (const match of text.matchAll(/<em>(.*?)<\/em>/g)) {
    if (match) {
      // Add the text between the last match and the current match to the split text array.
      splitText.push(text.substring(lastMatchIndex, match.index));

      // Add the matched text to the split text array, surrounded by <em> tags.
      splitText.push(<em>{match[1]}</em>);

      // Update the last match index to the index after the current match.
      lastMatchIndex = (match.index ?? 0) + match[0].length;
    }
  }

  // Add the remaining text to the split text array.
  splitText.push(text.substring(lastMatchIndex));
  return splitText;
}

export const renderMdxRawTable = (node: MdxNodeJsxElement, highlights: string[]):
{ element: React.ReactElement | string, isHighlight: boolean } => {
  const children = node.children?.map(
    (child) => renderMdxRawTable(child as MdxNodeJsxElement, highlights),
  ) ?? [];

  if (node.type === 'mdxJsxFlowElement') {
    const attributes = {};

    node.attributes
      .filter((attr) => attr.type === 'mdxJsxAttribute')
      .forEach((attr) => { attributes[attr.name] = attr.value; });

    if (!(components as any)[node.name]) {
      // Don't throw on unknown component
      return { element: '', isHighlight: false };
    }
    const isHighlight = children.some((child) => child.isHighlight);

    if (node.name === 'Tr' && !isHighlight) {
      return {
        element: '',
        isHighlight: false,
      };
    }

    return {
      element: React.createElement(
        (components as any)[node.name],
        { ...attributes },
        children.map((child) => child.element),
      ),
      isHighlight,
    };
  }

  if (node.type === 'text') {
    // eslint-disable-next-line react/no-danger
    const highlightedText = highlightText(node.value, highlights);
    const isHighlight = highlightedText.includes('<em>');

    return ({
      element: (
        <>
          {renderHighlightText(highlightedText)}
        </>
      ),
      isHighlight,
    });
  }
  if (node.value) {
    const isHighlight = node.value.includes('<em>');

    return ({
      element: React.createElement((components as any)[node.type], {}, node.value),
      isHighlight,
    });
  }

  if (!(components as any)[node.type]) {
    // Don't throw on unknown component
    return {
      element: '',
      isHighlight: false,
    };
  }

  return ({
    element: React.createElement(
      (components as any)[node.type],
      { node },
      ...children.map((el) => el.element),
    ),
    isHighlight: children.some((el) => el.isHighlight),
  });
};