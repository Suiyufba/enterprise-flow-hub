"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../lib/toast-context";
import type { Customer, Product, PaginatedList } from "shared";

interface LineItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export default function NewOrderPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { workspace, refresh } = useWorkspace();
  const { showToast } = useToast();
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ productId: "", quantity: 1, unitPrice: 0 }]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enterpriseId) return;
    const params = new URLSearchParams({ enterpriseId, limit: "200" });
    Promise.all([
      fetchJson<PaginatedList<Customer>>(`/customers?${params}`, { adminUserId: user?.id }),
      fetchJson<PaginatedList<Product>>(`/products?${params}`, { adminUserId: user?.id }),
    ])
      .then(([cr, pr]) => {
        setCustomers(cr.items);
        setProducts(pr.items);
      })
      .catch(() => showToast("加载数据失败", "error"));
  }, [enterpriseId, user?.id, showToast]);

  function addItem() {
    setItems((prev) => [...prev, { productId: "", quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function onProductSelect(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          productId,
          unitPrice: product ? product.unitPrice : item.unitPrice,
        };
      })
    );
  }

  async function handleSubmit() {
    if (items.length === 0 || items.some((i) => !i.productId || i.quantity <= 0)) {
      showToast("请完善订单项目", "error");
      return;
    }
    setSaving(true);
    try {
      await fetchJson("/orders", {
        method: "POST",
        body: JSON.stringify({
          enterpriseId,
          customerId: customerId || undefined,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          notes: notes.trim() || undefined,
        }),
        adminUserId: user?.id,
      });
      showToast("订单已创建", "success");
      await refresh();
      router.push("/orders");
    } catch {
      showToast("创建失败", "error");
    } finally {
      setSaving(false);
    }
  }

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  return (
    <div className="main" style={{ alignItems: "flex-start", paddingTop: "40px" }}>
      <div className="page-shell">
        <div className="page-header">
          <h1>新建订单</h1>
          <p>选择客户和商品来创建新订单</p>
        </div>

        <div className="page-form-grid" style={{ maxWidth: 640 }}>
          <label className="form-label">客户</label>
          <select className="page-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">选择客户（可选）</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <label className="form-label">订单项目</label>
          <div style={{ display: "grid", gap: 8 }}>
            {items.map((item, index) => (
              <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  className="page-input"
                  value={item.productId}
                  onChange={(e) => onProductSelect(index, e.target.value)}
                  style={{ flex: 2 }}
                >
                  <option value="">选择商品</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} (¥{p.unitPrice}/{p.unit})</option>
                  ))}
                </select>
                <input
                  className="page-input"
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                  placeholder="数量"
                  style={{ flex: 1 }}
                />
                <input
                  className="page-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)}
                  placeholder="单价"
                  style={{ flex: 1 }}
                />
                <span style={{ width: 70, textAlign: "right", fontSize: 13, color: "var(--c-c0c0c0)", whiteSpace: "nowrap" }}>
                  ¥{(item.quantity * item.unitPrice).toFixed(2)}
                </span>
                <button className="sidebar-mini-action danger" onClick={() => removeItem(index)} type="button" title="删除" style={{ flexShrink: 0 }}>
                  ×
                </button>
              </div>
            ))}
            <button className="page-secondary-button" onClick={addItem} type="button" style={{ justifySelf: "start", fontSize: 13 }}>
              + 添加项目
            </button>
          </div>

          {items.length > 0 && (
            <div style={{ textAlign: "right", fontSize: 15, fontWeight: 700, color: "var(--c-f0f0f0)", padding: "8px 0" }}>
              合计: ¥{total.toFixed(2)}
            </div>
          )}

          <label className="form-label">备注</label>
          <textarea className="page-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="订单备注..." rows={3} />

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button
              className="page-primary-button"
              onClick={handleSubmit}
              disabled={saving || items.length === 0 || items.some((i) => !i.productId)}
              type="button"
            >
              {saving ? "创建中..." : "创建订单"}
            </button>
            <button className="page-secondary-button" onClick={() => router.back()} type="button">取消</button>
          </div>
        </div>
      </div>
    </div>
  );
}
