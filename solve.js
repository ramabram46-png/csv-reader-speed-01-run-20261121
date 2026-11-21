// csv-reader-speed-01 entry: a fast, exact re-implementation of csv-reader 1.0.0.
//
// run(input) answers {columns, rows, errors} for one {text, header} case, with
// exactly the reference reader's broken-row policy:
//
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it is one quote, each CRLF or lone CR inside it reads as LF; what
//     follows its closing quote, up to the next comma or line break, is appended
//     as it stands (quote_junk, when the field ends); a quote that never closes
//     is a literal character and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it, each padded with "" (short_row) or cut (long_row) to the
//     first record's width;
//   - each error is {code, line, row}, in the order met; line is the 1-based line
//     its record starts on, row its record's index in rows (null for the header).
//
// Speed comes from never walking the text one character at a time on the common
// path: an unquoted field is cut with two bounded indexOf calls (next comma, next
// LF) plus one short scan of the cut slice for a stray CR, and a quoted field is
// cut with one indexOf for its closing quote when it holds no doubled quote and
// no line break. Only the rare fields (a stray CR, a doubled quote, a line break
// inside quotes, a quote that never closes) fall back to a step-by-step scan.
// Nothing is kept from one run() call to the next.

const COMMA = 0; // a field ended at a comma: the record goes on
const BREAK = 1; // a field ended at a line break: the record ends
const END = 2; // a field ended at the end of the text: the record ends

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes
  // (null: the header). Errors raised while reading it point at these.
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and (for a field read as the
  // junk after a closing quote) how many characters were kept.
  let fValue = '';
  let fEnd = END;
  let fAdded = 0;

  // The next quote, CR or LF at or after p; used only by the quoted slow path.
  const RE_Q = /["\r\n]/g;

  // Reads unquoted characters onto `init` up to the next comma or line break: a
  // CR not followed by LF is dropped (stray_cr). Sets fValue, fEnd, fAdded.
  function unquoted(init) {
    let value = init;
    let added = 0;
    for (;;) {
      if (pos >= len) {
        fValue = value;
        fEnd = END;
        fAdded = added;
        return;
      }
      const c = text.indexOf(',', pos);
      const n = text.indexOf('\n', pos);
      let m;
      let end;
      if (c === -1) {
        if (n === -1) {
          m = len;
          end = END;
        } else {
          m = n;
          end = BREAK;
        }
      } else if (n === -1) {
        m = c;
        end = COMMA;
      } else if (c < n) {
        m = c;
        end = COMMA;
      } else {
        m = n;
        end = BREAK;
      }
      // The field's characters end at e: for a CRLF line break the CR before the
      // LF belongs to the break, not to the field.
      let e = m;
      if (end === BREAK && m > pos && text.charCodeAt(m - 1) === 13) e = m - 1;
      const seg = text.slice(pos, e);
      if (seg.indexOf('\r') === -1) {
        if (value === '') value = seg;
        else if (seg !== '') value += seg;
        added += seg.length;
        if (end === COMMA) {
          pos = m + 1;
          fValue = value;
          fEnd = COMMA;
          fAdded = added;
          return;
        }
        if (end === BREAK) {
          pos = m + 1;
          line += 1;
          fValue = value;
          fEnd = BREAK;
          fAdded = added;
          return;
        }
        pos = len;
        fValue = value;
        fEnd = END;
        fAdded = added;
        return;
      }
      // A stray CR sits inside this field: walk it one character at a time.
      for (;;) {
        if (pos >= len) {
          fValue = value;
          fEnd = END;
          fAdded = added;
          return;
        }
        const ch = text.charCodeAt(pos);
        if (ch === 44) {
          pos += 1;
          fValue = value;
          fEnd = COMMA;
          fAdded = added;
          return;
        }
        if (ch === 10) {
          pos += 1;
          line += 1;
          fValue = value;
          fEnd = BREAK;
          fAdded = added;
          return;
        }
        if (ch === 13) {
          if (text.charCodeAt(pos + 1) === 10) {
            pos += 2;
            line += 1;
            fValue = value;
            fEnd = BREAK;
            fAdded = added;
            return;
          }
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          pos += 1;
          continue;
        }
        value += text[pos];
        added += 1;
        pos += 1;
      }
    }
  }

  // What follows a quoted field's closing quote, up to the next comma or line
  // break, appended to `value` as it stands. Sets fValue and fEnd.
  function afterClose(value) {
    if (pos >= len) {
      fValue = value;
      fEnd = END;
      return;
    }
    const ch = text.charCodeAt(pos);
    if (ch === 44) {
      pos += 1;
      fValue = value;
      fEnd = COMMA;
      return;
    }
    if (ch === 10) {
      pos += 1;
      line += 1;
      fValue = value;
      fEnd = BREAK;
      return;
    }
    if (ch === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = value;
      fEnd = BREAK;
      return;
    }
    unquoted(value);
    if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue and fEnd.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    const start = pos + 1;
    // Fast path: the first quote after the opening one closes the field, and
    // nothing between them is a line break.
    const q = text.indexOf('"', start);
    if (q !== -1 && text.charCodeAt(q + 1) !== 34) {
      const seg = text.slice(start, q);
      if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) {
        pos = q + 1;
        afterClose(seg);
        return;
      }
    }
    // Slow path: doubled quotes and/or line breaks inside, or no closing quote.
    let value = '';
    let p = start;
    RE_Q.lastIndex = p;
    for (;;) {
      const m = RE_Q.exec(text);
      if (m === null) {
        // The quote never closes: it is a literal character, and the text after
        // it is read again as unquoted. The line goes back to the opening
        // quote's line: the breaks the failed scan crossed do not count.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        unquoted('"');
        return;
      }
      const i = m.index;
      const ch = text.charCodeAt(i);
      if (ch === 34) {
        if (text.charCodeAt(i + 1) === 34) {
          value += text.slice(p, i);
          value += '"';
          p = i + 2;
          RE_Q.lastIndex = p;
          continue;
        }
        value += text.slice(p, i);
        pos = i + 1;
        afterClose(value);
        return;
      }
      if (ch === 13) {
        // CRLF and a lone CR inside quotes are each one LF.
        value += text.slice(p, i);
        value += '\n';
        line += 1;
        p = text.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
        RE_Q.lastIndex = p;
        continue;
      }
      value += text.slice(p, i + 1);
      line += 1;
      p = i + 1;
      RE_Q.lastIndex = p;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    let ended;
    do {
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        readQuoted();
      } else {
        lastQuoted = false;
        unquoted('');
      }
      fields.push(fValue);
      ended = fEnd;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
