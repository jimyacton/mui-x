import { FieldSection, MuiPickersAdapter, PickersTimezone, PickerValidDate } from '../../../models';
import { PickersLocaleText } from '../../../locales';
import {
  applyLocalizedDigits,
  cleanLeadingZeros,
  doesSectionFormatHaveLeadingZeros,
  getDateSectionConfigFromFormatToken,
  removeLocalizedDigits,
} from './useField.utils';

interface BuildSectionsFromFormatParams<TDate extends PickerValidDate> {
  utils: MuiPickersAdapter<TDate>;
  format: string;
  formatDensity: 'dense' | 'spacious';
  isRTL: boolean;
  timezone: PickersTimezone;
  shouldRespectLeadingZeros: boolean;
  localeText: PickersLocaleText<TDate>;
  localizedDigits: string[];
  date: TDate | null;
  enableAccessibleFieldDOMStructure: boolean;
}

type FormatEscapedParts = { start: number; end: number }[];

const expandFormat = <TDate extends PickerValidDate>({
  utils,
  format,
}: BuildSectionsFromFormatParams<TDate>) => {
  // Expand the provided format
  let formatExpansionOverflow = 10;
  let prevFormat = format;
  let nextFormat = utils.expandFormat(format);
  while (nextFormat !== prevFormat) {
    prevFormat = nextFormat;
    nextFormat = utils.expandFormat(prevFormat);
    formatExpansionOverflow -= 1;
    if (formatExpansionOverflow < 0) {
      throw new Error(
        'MUI X: The format expansion seems to be in an infinite loop. Please open an issue with the format passed to the picker component.',
      );
    }
  }

  return nextFormat;
};

const getEscapedPartsFromFormat = <TDate extends PickerValidDate>({
  utils,
  expandedFormat,
}: BuildSectionsFromFormatParams<TDate> & { expandedFormat: string }) => {
  const escapedParts: FormatEscapedParts = [];
  const { start: startChar, end: endChar } = utils.escapedCharacters;
  const regExp = new RegExp(`(\\${startChar}[^\\${endChar}]*\\${endChar})+`, 'g');

  let match: RegExpExecArray | null = null;
  // eslint-disable-next-line no-cond-assign
  while ((match = regExp.exec(expandedFormat))) {
    escapedParts.push({ start: match.index, end: regExp.lastIndex - 1 });
  }

  return escapedParts;
};

const getSectionPlaceholder = <TDate extends PickerValidDate>(
  utils: MuiPickersAdapter<TDate>,
  timezone: PickersTimezone,
  localeText: PickersLocaleText<TDate>,
  sectionConfig: Pick<FieldSection, 'type' | 'contentType'>,
  sectionFormat: string,
) => {
  switch (sectionConfig.type) {
    case 'year': {
      return localeText.fieldYearPlaceholder({
        digitAmount: utils.formatByString(utils.date(undefined, timezone), sectionFormat).length,
        format: sectionFormat,
      });
    }

    case 'month': {
      return localeText.fieldMonthPlaceholder({
        contentType: sectionConfig.contentType,
        format: sectionFormat,
      });
    }

    case 'day': {
      return localeText.fieldDayPlaceholder({ format: sectionFormat });
    }

    case 'weekDay': {
      return localeText.fieldWeekDayPlaceholder({
        contentType: sectionConfig.contentType,
        format: sectionFormat,
      });
    }

    case 'hours': {
      return localeText.fieldHoursPlaceholder({ format: sectionFormat });
    }

    case 'minutes': {
      return localeText.fieldMinutesPlaceholder({ format: sectionFormat });
    }

    case 'seconds': {
      return localeText.fieldSecondsPlaceholder({ format: sectionFormat });
    }

    case 'meridiem': {
      return localeText.fieldMeridiemPlaceholder({ format: sectionFormat });
    }

    default: {
      return sectionFormat;
    }
  }
};

const createSection = <TDate extends PickerValidDate>({
  utils,
  timezone,
  date,
  shouldRespectLeadingZeros,
  localeText,
  localizedDigits,
  now,
  token,
  startSeparator,
}: BuildSectionsFromFormatParams<TDate> & {
  now: TDate;
  token: string;
  startSeparator: string;
}): FieldSection => {
  if (token === '') {
    throw new Error('MUI X: Should not call `commitToken` with an empty token');
  }

  const sectionConfig = getDateSectionConfigFromFormatToken(utils, token);

  const hasLeadingZerosInFormat = doesSectionFormatHaveLeadingZeros(
    utils,
    timezone,
    sectionConfig.contentType,
    sectionConfig.type,
    token,
  );

  const hasLeadingZerosInInput = shouldRespectLeadingZeros
    ? hasLeadingZerosInFormat
    : sectionConfig.contentType === 'digit';

  const isValidDate = date != null && utils.isValid(date);
  let sectionValue = isValidDate ? utils.formatByString(date, token) : '';
  let maxLength: number | null = null;

  if (hasLeadingZerosInInput) {
    if (hasLeadingZerosInFormat) {
      maxLength =
        sectionValue === '' ? utils.formatByString(now, token).length : sectionValue.length;
    } else {
      if (sectionConfig.maxLength == null) {
        throw new Error(
          `MUI X: The token ${token} should have a 'maxDigitNumber' property on it's adapter`,
        );
      }

      maxLength = sectionConfig.maxLength;

      if (isValidDate) {
        sectionValue = applyLocalizedDigits(
          cleanLeadingZeros(removeLocalizedDigits(sectionValue, localizedDigits), maxLength),
          localizedDigits,
        );
      }
    }
  }

  return {
    ...sectionConfig,
    format: token,
    maxLength,
    value: sectionValue,
    placeholder: getSectionPlaceholder(utils, timezone, localeText, sectionConfig, token),
    hasLeadingZerosInFormat,
    hasLeadingZerosInInput,
    startSeparator,
    endSeparator: '',
    modified: false,
  };
};

const buildSections = <TDate extends PickerValidDate>(
  params: BuildSectionsFromFormatParams<TDate> & {
    expandedFormat: string;
    escapedParts: FormatEscapedParts;
  },
) => {
  const { utils, expandedFormat, escapedParts } = params;

  const now = utils.date(undefined);
  const sections: FieldSection[] = [];
  let startSeparator: string = '';

  // This RegExp test if the beginning of a string corresponds to a supported token
  const isTokenStartRegExp = new RegExp(
    `^(${Object.keys(utils.formatTokenMap)
      .sort((a, b) => b.length - a.length) // Sort to put longest word first
      .join('|')})`,
    'g', // used to get access to lastIndex state
  );

  let currentTokenValue = '';

  for (let i = 0; i < expandedFormat.length; i += 1) {
    const escapedPartOfCurrentChar = escapedParts.find(
      (escapeIndex) => escapeIndex.start <= i && escapeIndex.end >= i,
    );

    const char = expandedFormat[i];
    const isEscapedChar = escapedPartOfCurrentChar != null;
    const potentialToken = `${currentTokenValue}${expandedFormat.slice(i)}`;
    const regExpMatch = isTokenStartRegExp.test(potentialToken);

    if (!isEscapedChar && char.match(/([A-Za-z]+)/) && regExpMatch) {
      currentTokenValue = potentialToken.slice(0, isTokenStartRegExp.lastIndex);
      i += isTokenStartRegExp.lastIndex - 1;
    } else {
      // If we are on the opening or closing character of an escaped part of the format,
      // Then we ignore this character.
      const isEscapeBoundary =
        (isEscapedChar && escapedPartOfCurrentChar?.start === i) ||
        escapedPartOfCurrentChar?.end === i;

      if (!isEscapeBoundary) {
        if (currentTokenValue !== '') {
          sections.push(
            createSection({ ...params, now, token: currentTokenValue, startSeparator }),
          );
          currentTokenValue = '';
        }

        if (sections.length === 0) {
          startSeparator += char;
        } else {
          startSeparator = '';
          sections[sections.length - 1].endSeparator += char;
        }
      }
    }
  }

  if (currentTokenValue !== '') {
    sections.push(createSection({ ...params, now, token: currentTokenValue, startSeparator }));
  }

  if (sections.length === 0 && startSeparator.length > 0) {
    sections.push({
      type: 'empty',
      contentType: 'letter',
      maxLength: null,
      format: '',
      value: '',
      placeholder: '',
      hasLeadingZerosInFormat: false,
      hasLeadingZerosInInput: false,
      startSeparator,
      endSeparator: '',
      modified: false,
    });
  }

  return sections;
};

const postProcessSections = <TDate extends PickerValidDate>({
  isRTL,
  formatDensity,
  sections,
}: BuildSectionsFromFormatParams<TDate> & {
  sections: FieldSection[];
}) => {
  return sections.map((section) => {
    const cleanSeparator = (separator: string) => {
      let cleanedSeparator = separator;
      if (isRTL && cleanedSeparator !== null && cleanedSeparator.includes(' ')) {
        cleanedSeparator = `\u2069${cleanedSeparator}\u2066`;
      }

      if (formatDensity === 'spacious' && ['/', '.', '-'].includes(cleanedSeparator)) {
        cleanedSeparator = ` ${cleanedSeparator} `;
      }

      return cleanedSeparator;
    };

    section.startSeparator = cleanSeparator(section.startSeparator);
    section.endSeparator = cleanSeparator(section.endSeparator);

    return section;
  });
};

export const buildSectionsFromFormat = <TDate extends PickerValidDate>(
  params: BuildSectionsFromFormatParams<TDate>,
) => {
  let expandedFormat = expandFormat(params);
  if (params.isRTL && params.enableAccessibleFieldDOMStructure) {
    expandedFormat = expandedFormat.split(' ').reverse().join(' ');
  }

  const escapedParts = getEscapedPartsFromFormat({ ...params, expandedFormat });
  const sections = buildSections({ ...params, expandedFormat, escapedParts });

  return postProcessSections({ ...params, sections });
};
