import { _options } from ".";
import { Column, ColumnType, Parameter, Parameters, Row, XapiValueType } from "./types";


function stringToDate(value: string): Date | undefined {
  if (!value) return undefined;
  const strlen = value.length;
  switch (strlen) {
    case 8: // yyyyMMdd
      return new Date(
        parseInt(value.substring(0, 4), 10),
        parseInt(value.substring(4, 6), 10) - 1,
        parseInt(value.substring(6, 8), 10)
      );
    case 14: // yyyyMMddHHmmss
      return new Date(
        parseInt(value.substring(0, 4), 10),
        parseInt(value.substring(4, 6), 10) - 1,
        parseInt(value.substring(6, 8), 10),
        parseInt(value.substring(8, 10), 10),
        parseInt(value.substring(10, 12), 10),
        parseInt(value.substring(12, 14), 10)
      );
    case 16: // yyyyMMddHHmmssSSS
      return new Date(
        parseInt(value.substring(0, 4), 10),
        parseInt(value.substring(4, 6), 10) - 1,
        parseInt(value.substring(6, 8), 10),
        parseInt(value.substring(8, 10), 10),
        parseInt(value.substring(10, 12), 10),
        parseInt(value.substring(12, 14), 10),
        parseInt(value.substring(14, 16), 10)
      );
    case 6: // HHmmss
      return new Date(
        1970,
        0,
        1,
        parseInt(value.substring(0, 2), 10),
        parseInt(value.substring(2, 4), 10),
        parseInt(value.substring(4, 6), 10)
      );
  }
}

function dateToString(date: Date, type: Extract<ColumnType, "DATE" | "DATETIME" | "TIME">): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');

  switch (type) {
    case "DATE":
      return `${year}${month}${day}`;
    case "DATETIME":
      return `${year}${month}${day}${hours}${minutes}${seconds}`;
    case "TIME":
      return `${hours}${minutes}${seconds}`;
    default:
      return '';
  }
}

/**
 * 문자열을 HTML 엔티티로 변환(Escape)합니다.
 * - 기본 HTML 특수 문자 (<, >, &, ", ')를 변환합니다.
 * - ASCII 32번(공백) 이하의 제어 문자 및 공백을 변환합니다.
 * - 줄바꿈(\n)은 <br> 태그로 변환됩니다.
 * - 공백(' ')은 &nbsp;로 변환됩니다.
 * - 탭(\t) 및 기타 제어 문자는 숫자 엔티티(&#...;)로 변환됩니다.
 * @param str 변환할 원본 문자열
 * @returns 변환된 HTML 엔티티 문자열
 */
export function escapeHtml(str: string): string {
  if (!str) {
    return "";
  }

  // 변환 규칙이 명확한 문자들을 위한 매핑
  const entityMap: { [key: string]: string } = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
    ' ': '&nbsp;',
    '\n': '<br>',
  };

  // 정규식 설명:
  // /[<>&"' \n\x00-\x1f]/g
  // [<>&"' \n] : 위 entityMap에서 처리할 기본 특수 문자, 공백, 줄바꿈을 찾습니다.
  // | : 또는
  // [\x00-\x1f] : ASCII 0번부터 31번까지의 제어 문자를 찾습니다.
  // g : 전역(global) 플래그로, 문자열 전체에서 찾습니다.
  const regex = /[<>&"' \n\x00-\x1f]/g;

  return str.replace(regex, (match) => {
    // entityMap에 정의된 문자인 경우, 매핑된 값을 반환합니다.
    if (entityMap[match]) {
      return entityMap[match];
    }
    // 그 외의 제어 문자인 경우, 숫자 엔티티로 변환합니다.
    // (예: \t -> &#9;)
    return `&#${match.charCodeAt(0)};`;
  });
}

/**
 * HTML 엔티티를 원래 문자로 복원(Unescape)합니다.
 * - escapeHtml 함수에 의해 변환된 문자열을 원래대로 되돌립니다.
 * @param str 변환된 HTML 엔티티 문자열
 * @returns 복원된 원본 문자열
 */
export function unescapeHtml(str: string): string {
  if (!str) {
    return "";
  }

  // 역변환을 위한 매핑
  const textEntityMap: { [key: string]: string } = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  };

  // 정규식 설명:
  // /&lt;|&gt;|&amp;|&quot;|&#39;|&nbsp;|<br\s*\/?>|&#(\d+);/gi
  // &lt;|&gt;... : 명명된 엔티티들을 찾습니다.
  // <br\s*\/?> : <br>, <br/> 등 다양한 형태의 br 태그를 찾습니다.
  // &#(\d+); : 숫자 엔티티(&#...)를 찾고, 숫자 부분을 그룹으로 캡처합니다.
  // g: 전역, i: 대소문자 무시
  const regex = /&lt;|&gt;|&amp;|&quot;|&#39;|&nbsp;|<br\s*\/?>|&#(\d+);/gi;

  return str.replace(regex, (match, capturedNumber) => {
    // 1. 명명된 엔티티 또는 br 태그 처리
    const lowerCaseMatch = match.toLowerCase();
    if (textEntityMap[lowerCaseMatch]) {
      return textEntityMap[lowerCaseMatch];
    }
    if (lowerCaseMatch.startsWith('<br')) {
      return '\n';
    }

    // 2. 숫자 엔티티(&#...;) 처리
    if (capturedNumber) {
      return String.fromCharCode(parseInt(capturedNumber, 10));
    }

    // 예외 케이스 처리
    return match;
  });
}

export class XapiRoot {
  datasets: Dataset[] = [];
  parameters: Parameters = { params: [] };

  constructor(datasets: Dataset[] = [], parameters: Parameters = { params: [] }) {
    this.datasets = datasets;
    this.parameters = parameters;
  }

  addDataset(dataset: Dataset): void {
    this.datasets.push(dataset);
  }

  addParameter(parameter: Parameter): void {
    this.parameters.params.push(parameter);
  }

  setParameters(parameters: Parameters): void {
    this.parameters = parameters;
  }

  setParameter(id: string, value: XapiValueType): void {
    const param = this.parameters.params.find(p => p.id === id);
    if (param) {
      param.value = value;
    } else {
      this.addParameter({ id, value });
    }
  }


}

export class Dataset {
  id: string;
  columns: Column[] = [];
  rows: Row[] = [];
  private _columnIndexMap: Map<string, number> = new Map();
  constructor(id: string, columns: Column[] = [], rows: Row[] = []) {
    this.id = id;
    this.columns = columns;
    this.rows = rows;
  }

  addColumn(column: Column): void {
    this.columns.push(column);
    this._columnIndexMap.set(column.id, this.columns.length - 1);
  }

  addRow(row: Row): void {
    this.rows.push(row);
  }
  getColumnIndex(columnId: string): number | undefined {
    return this._columnIndexMap.get(columnId);
  }

  getColumn(rowIdx: number, columnId: string): XapiValueType | undefined {
    const colIndex = this.getColumnIndex(columnId);
    let retVal: XapiValueType | undefined = undefined;
    if (colIndex !== undefined && rowIdx < this.rows.length) {
      retVal = this.rows[rowIdx].cols[colIndex]?.value;
    }
    if (_options.castToColumnType && retVal !== undefined) {
    }
    return retVal;
  }
}