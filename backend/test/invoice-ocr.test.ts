import assert from "node:assert/strict";
import test from "node:test";
import { parseInvoiceText } from "../src/ai/ocr.js";

test("invoice OCR text parser extracts the core VAT invoice fields", () => {
  const fields = parseInvoiceText(`
    深圳市增值税普通发票
    发票代码：044001900111
    发票号码：87282299610001
    开票日期：2019年02月18日
    购买方 纳税人识别号：91440300123456789X
    合计金额 ￥283.02
    合计税额 ￥16.98
    价税合计（小写）￥300.00
    税率：6%
    销售方 纳税人识别号：91440300708461136T
  `);

  assert.equal(fields.invoiceType, "vat_normal");
  assert.equal(fields.invoiceCode, "044001900111");
  assert.equal(fields.invoiceNumber, "87282299610001");
  assert.equal(fields.issuedAt, "2019-02-18");
  assert.equal(fields.amount, 283.02);
  assert.equal(fields.taxAmount, 16.98);
  assert.equal(fields.totalAmount, 300);
  assert.equal(fields.taxRate, 0.06);
  assert.equal(fields.buyerTaxId, "91440300123456789X");
  assert.equal(fields.sellerTaxId, "91440300708461136T");
});
