/**
 * Pure client-side OpenXML (.xlsx) generator (Zero external dependencies).
 * Produces a valid Excel 2007+ .xlsx ZIP archive with styling, column widths,
 * UTF-8 Vietnamese strings, numeric cells, and live Excel formulas.
 */
(function () {
  const CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[n] = c >>> 0;
  }

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function encodeUTF8(str) {
    return new TextEncoder().encode(str);
  }

  function createZip(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encodeUTF8(file.name);
      const dataBytes = typeof file.data === 'string' ? encodeUTF8(file.data) : file.data;
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      // Local file header (30 bytes + filename)
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true); // Signature
      lv.setUint16(4, 20, true);         // Version needed (2.0)
      lv.setUint16(6, 0x0800, true);     // UTF-8 flag
      lv.setUint16(8, 0, true);          // Compression: 0 (Stored)
      lv.setUint16(10, 0, true);         // Mod time
      lv.setUint16(12, 0x555b, true);    // Mod date
      lv.setUint32(14, crc, true);       // CRC32
      lv.setUint32(18, size, true);      // Compressed size
      lv.setUint32(22, size, true);      // Uncompressed size
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);         // Extra field length
      localHeader.set(nameBytes, 30);

      localParts.push(localHeader, dataBytes);

      // Central directory header (46 bytes + filename)
      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true); // Signature
      cv.setUint16(4, 20, true);         // Version made by
      cv.setUint16(6, 20, true);         // Version needed
      cv.setUint16(8, 0x0800, true);     // UTF-8 flag
      cv.setUint16(10, 0, true);         // Compression: 0 (Stored)
      cv.setUint16(12, 0, true);         // Mod time
      cv.setUint16(14, 0x555b, true);    // Mod date
      cv.setUint32(16, crc, true);       // CRC32
      cv.setUint32(20, size, true);      // Compressed size
      cv.setUint32(24, size, true);      // Uncompressed size
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);         // Extra length
      cv.setUint16(32, 0, true);         // Comment length
      cv.setUint16(34, 0, true);         // Disk number
      cv.setUint16(36, 0, true);         // Internal attrs
      cv.setUint32(38, 0, true);         // External attrs
      cv.setUint32(42, offset, true);    // Relative offset
      centralHeader.set(nameBytes, 46);

      centralParts.push(centralHeader);
      offset += localHeader.length + dataBytes.length;
    }

    let centralSize = 0;
    for (const part of centralParts) centralSize += part.length;

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    const totalLength = offset + centralSize + eocd.length;
    const out = new Uint8Array(totalLength);
    let pos = 0;
    for (const part of localParts) {
      out.set(part, pos);
      pos += part.length;
    }
    for (const part of centralParts) {
      out.set(part, pos);
      pos += part.length;
    }
    out.set(eocd, pos);
    return out;
  }

  function escapeXml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function colName(colIdx) {
    let s = '';
    let n = colIdx;
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  /**
   * Style indices in styles.xml:
   * 0 = Default
   * 1 = Title (14pt Bold, Dark Red/Rust text)
   * 2 = Subtitle / Meta Info (11pt Italic)
   * 3 = Table Header (11pt Bold, White text on Terracotta/Slate fill, Bordered, Centered)
   * 4 = Data Text Left (Bordered)
   * 5 = Data Text Center (Bordered, Centered)
   * 6 = Data Integer / Currency (Bordered, #,##0)
   * 7 = Total Label (Bold, Bordered, Soft Amber fill, Right aligned)
   * 8 = Total Value (Bold, Bordered, Soft Amber fill, #,##0)
   */
  function buildStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0"/>
  </numFmts>
  <fonts count="5">
    <font><sz val="11"/><color theme="1"/><name val="Arial"/></font>
    <font><b/><sz val="14"/><color rgb="FF9A3412"/><name val="Arial"/></font>
    <font><i/><sz val="10"/><color rgb="FF475569"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Arial"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="4" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;
  }

  function generateOrderXlsxBytes(orderData) {
    const { items, customerName, customerPhone, customerNote, createdAt } = orderData;
    const rows = [];

    // Row 1: Title
    rows.push({
      height: 26,
      cells: [{ col: 1, type: 'str', val: 'ĐƠN ĐẶT HÀNG THANH LÝ HÀNG GIA DỤNG Ý (TVS & BORGONOVO)', style: 1 }]
    });

    // Row 2: Customer info
    const buyerSummary = [
      customerName ? `Khách hàng / Đại lý: ${customerName}` : 'Khách hàng / Đại lý: (Chưa nhập)',
      customerPhone ? `SĐT: ${customerPhone}` : '',
      `Ngày tạo đơn: ${createdAt || new Date().toLocaleString('vi-VN')}`
    ].filter(Boolean).join('   |   ');
    rows.push({
      height: 20,
      cells: [{ col: 1, type: 'str', val: buyerSummary, style: 2 }]
    });

    // Row 3: Customer Note
    rows.push({
      height: 20,
      cells: [{ col: 1, type: 'str', val: customerNote ? `Ghi chú đặt hàng: ${customerNote}` : 'Ghi chú: Giá thanh lý chưa bao gồm VAT & chi phí vận chuyển.', style: 2 }]
    });

    // Row 4: Blank spacer
    rows.push({ height: 12, cells: [] });

    // Row 5: Table Headers
    const headers = [
      'STT',
      'Mã số',
      'Mặt hàng',
      'Đơn vị',
      'Quy cách',
      'Tồn kho',
      'Số lượng đặt',
      'Ước tính thùng',
      'Đơn giá (VNĐ)',
      'Thành tiền (VNĐ)',
      'Chú thích'
    ];
    rows.push({
      height: 28,
      cells: headers.map((h, i) => ({ col: i + 1, type: 'str', val: h, style: 3 }))
    });

    const firstDataRow = 6;
    items.forEach((item, idx) => {
      const r = firstDataRow + idx;
      const p = item.product;
      const qty = item.qty;
      const lineTotal = qty * p.price;
      const boxesText = p.packQty > 1 ? `${(qty / p.packQty).toFixed(qty % p.packQty === 0 ? 0 : 1)} thùng (${p.packSpec})` : p.packSpec;

      rows.push({
        height: 22,
        cells: [
          { col: 1, type: 'num', val: idx + 1, style: 5 },
          { col: 2, type: 'num', val: p.code, style: 5 },
          { col: 3, type: 'str', val: p.name, style: 4 },
          { col: 4, type: 'str', val: p.unit, style: 5 },
          { col: 5, type: 'str', val: p.packSpec, style: 5 },
          { col: 6, type: 'num', val: p.stock, style: 6 },
          { col: 7, type: 'num', val: qty, style: 6 },
          { col: 8, type: 'str', val: boxesText, style: 5 },
          { col: 9, type: 'num', val: p.price, style: 6 },
          { col: 10, type: 'formula', formula: `G${r}*I${r}`, val: lineTotal, style: 6 },
          { col: 11, type: 'str', val: p.note || (qty >= p.stock ? 'Lấy hết tồn' : ''), style: 4 }
        ]
      });
    });

    const lastDataRow = firstDataRow + items.length - 1;
    const totalRowIdx = lastDataRow + 1;
    const totalQty = items.reduce((acc, x) => acc + x.qty, 0);
    const totalAmount = items.reduce((acc, x) => acc + x.qty * x.product.price, 0);

    // Total Row
    rows.push({
      height: 26,
      cells: [
        { col: 1, type: 'str', val: '', style: 7 },
        { col: 2, type: 'str', val: '', style: 7 },
        { col: 3, type: 'str', val: 'TỔNG CỘNG ĐƠN ĐẶT HÀNG', style: 7 },
        { col: 4, type: 'str', val: '', style: 7 },
        { col: 5, type: 'str', val: '', style: 7 },
        { col: 6, type: 'str', val: '', style: 7 },
        { col: 7, type: 'formula', formula: `SUM(G${firstDataRow}:G${lastDataRow})`, val: totalQty, style: 8 },
        { col: 8, type: 'str', val: '', style: 7 },
        { col: 9, type: 'str', val: '', style: 7 },
        { col: 10, type: 'formula', formula: `SUM(J${firstDataRow}:J${lastDataRow})`, val: totalAmount, style: 8 },
        { col: 11, type: 'str', val: 'Chưa gồm VAT & VC', style: 7 }
      ]
    });

    const colWidths = [7, 9, 32, 10, 14, 12, 15, 18, 16, 18, 24];
    const colsXml = colWidths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join('');

    const rowsXml = rows
      .map((r, rIdx) => {
        const rowNum = rIdx + 1;
        const htAttr = r.height ? ` ht="${r.height}" customHeight="1"` : '';
        const cellsXml = r.cells
          .map((c) => {
            const ref = `${colName(c.col)}${rowNum}`;
            const sAttr = c.style != null ? ` s="${c.style}"` : '';
            if (c.type === 'num') {
              return `<c r="${ref}"${sAttr}><v>${Number(c.val) || 0}</v></c>`;
            }
            if (c.type === 'formula') {
              return `<c r="${ref}"${sAttr}><f>${escapeXml(c.formula)}</f><v>${Number(c.val) || 0}</v></c>`;
            }
            return `<c r="${ref}" t="inlineStr"${sAttr}><is><t>${escapeXml(c.val)}</t></is></c>`;
          })
          .join('');
        return `<row r="${rowNum}"${htAttr}>${cellsXml}</row>`;
      })
      .join('');

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${colsXml}</cols>
  <sheetData>${rowsXml}</sheetData>
  <mergeCells count="3">
    <mergeCell ref="A1:K1"/>
    <mergeCell ref="A2:K2"/>
    <mergeCell ref="A3:K3"/>
  </mergeCells>
</worksheet>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Đơn đặt hàng" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    return createZip([
      { name: '[Content_Types].xml', data: contentTypesXml },
      { name: '_rels/.rels', data: rootRelsXml },
      { name: 'xl/workbook.xml', data: workbookXml },
      { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml },
      { name: 'xl/styles.xml', data: buildStylesXml() },
      { name: 'xl/worksheets/sheet1.xml', data: sheetXml }
    ]);
  }

  function downloadOrderXlsx(orderData, filename) {
    const bytes = generateOrderXlsxBytes(orderData);
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'Don-Dat-Hang-Gia-Dung-Y.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  window.OrderExcelExporter = {
    generateOrderXlsxBytes,
    downloadOrderXlsx
  };
})();
