// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader): run(input) returns
// exactly csv-reader's answer for every input, {columns, rows, errors}, but faster.
//
// How it stays identical: one left-to-right pass over the text, the same broken-row
// policy as the reference (BOM dropped; records end at LF or CRLF; a blank line is no
// record; a CR outside quotes not followed by LF is dropped as stray_cr; a field that
// opens with a quote runs to the next non-doubled quote, "" inside it one quote, each
// CRLF or lone CR inside it read as LF; what follows the closing quote up to the next
// comma or line break is appended as it stands, quote_junk when the field ends; a quote
// that never closes is a literal character and the text after it is read again as
// unquoted, unterminated_quote; a quote inside an unquoted field is a literal character;
// fields stay strings, never trimmed or converted; rows are padded with "" as short_row
// or cut as long_row to the first record's width; each error is {code, line, row} in the
// order met, line the 1-based line its record starts on, row its index in rows, null
// for the header).
//
// How it gets faster than the reference: the reference builds every field a character
// at a time (value += c) behind a function call and an object per field. This reader
// never builds a field a character at a time: unquoted fields are cut out with one
// slice() each, found by a tight charCodeAt loop that stops at the next delimiter;
// quoted fields are found by indexOf jumps between quotes, and their line breaks are
// counted from the finished value (one LF in it per line break inside the quotes).
// Nothing is allocated per field except the field string itself and its slot in the
// record; error objects are built only when an error actually occurs.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to the next.

/** csv-reader 1.0.0's answer for one case's input: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const len = text.length;
  let pos = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
  let line = 1;

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= len) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let fEnd = 0; // 0 comma, 1 line break, 2 end of text
    let fVal = '';
    let quoted = false;

    do {
      quoted = text.charCodeAt(pos) === 34;
      let done = false;
      let prefix = '';
      let junkCheck = false;
      if (quoted) {
        // A field that opens with a quote runs to the next quote that is not doubled.
        const open = pos;
        const openLine = line;
        let i = pos + 1;
        let seg = null;
        let start = i;
        let closePos = -1;
        while (true) {
          const q = text.indexOf('"', i);
          if (q === -1) break;
          if (text.charCodeAt(q + 1) === 34) {
            if (seg === null) seg = [];
            seg.push(text.slice(start, q + 1));
            i = q + 2;
            start = i;
            continue;
          }
          closePos = q;
          break;
        }
        if (closePos === -1) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          prefix = '"';
        } else {
          let value;
          if (seg === null) value = text.slice(open + 1, closePos);
          else { seg.push(text.slice(start, closePos)); value = seg.join(''); }
          // Each CRLF or lone CR inside quotes is read as LF.
          if (value.indexOf('\r') !== -1) value = value.replace(/\r\n?/g, '\n');
          // Every line break inside the quotes counts: one per LF in the value.
          let j = value.indexOf('\n');
          while (j !== -1) { line += 1; j = value.indexOf('\n', j + 1); }
          pos = closePos + 1;
          if (pos >= len) { fVal = value; fEnd = 2; done = true; }
          else {
            const c = text.charCodeAt(pos);
            if (c === 44) { pos += 1; fVal = value; fEnd = 0; done = true; }
            else if (c === 10) { pos += 1; line += 1; fVal = value; fEnd = 1; done = true; }
            else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; fVal = value; fEnd = 1; done = true; }
            else { prefix = value; junkCheck = true; }
          }
        }
      }
      if (!done) {
        // Reads unquoted characters up to the next comma or line break: a CR
        // not followed by LF is dropped (stray_cr). `prefix` is the text the
        // field already holds ('', the quoted value after a closing quote, or
        // '"' after a quote that never closed).
        let seg = null;
        let start = pos;
        let i = pos;
        let end = 2;
        let endCR = false; // the line break that ended the field was a CRLF
        let kept = 0;
        while (i < len) {
          const c = text.charCodeAt(i);
          if (c === 44) { end = 0; break; }
          if (c === 10) { end = 1; break; }
          if (c === 13) {
            if (text.charCodeAt(i + 1) === 10) { end = 1; endCR = true; break; }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            kept += i - start;
            if (seg === null) seg = [];
            seg.push(text.slice(start, i));
            i += 1;
            start = i;
            continue;
          }
          i += 1;
        }
        kept += i - start;
        let tail;
        if (seg === null) tail = text.slice(start, i);
        else { seg.push(text.slice(start, i)); tail = seg.join(''); }
        if (junkCheck && kept > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        fVal = prefix === '' ? tail : prefix + tail;
        if (end === 0) pos = i + 1;
        else if (end === 1) { pos = i + (endCR ? 2 : 1); line += 1; }
        else pos = i;
        fEnd = end;
      }
      fields.push(fVal);
    } while (fEnd === 0);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

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
