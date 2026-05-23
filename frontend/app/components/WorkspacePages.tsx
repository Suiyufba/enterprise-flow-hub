"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Automation, LibraryItem, Plugin, Project, Workspace } from "shared";
import { fetchJson } from "../lib/api";

const emptyWorkspace: Workspace = {
  enterprises: [],
  projects: [],
  conversations: [],
  libraryItems: [],
  plugins: [],
  automations: [],
};

function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setWorkspace(await fetchJson<Workspace>("/workspace"));
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  return { workspace, loading, refresh };
}

export function SearchPage() {
  const { workspace } = useWorkspace();
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const items = [
      ...workspace.projects.map((item) => ({ type: "项目", title: item.name })),
      ...workspace.conversations.map((item) => ({ type: "对话", title: item.title })),
      ...workspace.libraryItems.map((item) => ({ type: "资料", title: item.name })),
      ...workspace.automations.map((item) => ({ type: "自动化", title: item.name })),
    ];
    return keyword ? items.filter((item) => item.title.toLowerCase().includes(keyword)) : items;
  }, [query, workspace]);

  return (
    <PageShell title="搜索" description="跨企业、项目、对话、资料和自动化查找。">
      <input className="page-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索线索、订单、资料或规则" />
      <div className="page-list">
        {results.map((item) => (
          <div className="page-row" key={`${item.type}-${item.title}`}>
            <span>{item.type}</span>
            <strong>{item.title}</strong>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function LibraryPage() {
  const { workspace, refresh } = useWorkspace();
  const [projectId, setProjectId] = useState("proj-qihang-growth");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [type, setType] = useState<LibraryItem["type"]>("screenshot");

  async function addItem() {
    if (!name.trim() || !summary.trim()) return;
    await fetchJson<LibraryItem>("/library", {
      method: "POST",
      body: JSON.stringify({ projectId, name, summary, type }),
    });
    setName("");
    setSummary("");
    await refresh();
  }

  return (
    <PageShell title="资料库" description="沉淀截图、表格、文档和业务备注，供项目诊断使用。">
      <div className="page-form-grid">
        <select className="page-input" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          {workspace.projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        <select className="page-input" value={type} onChange={(event) => setType(event.target.value as LibraryItem["type"])}>
          <option value="screenshot">截图</option>
          <option value="spreadsheet">表格</option>
          <option value="document">文档</option>
          <option value="note">备注</option>
        </select>
        <input className="page-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="资料名称" />
        <input className="page-input" value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="资料说明" />
        <button className="page-primary-button" onClick={addItem} type="button">加入资料库</button>
      </div>
      <div className="page-card-grid">
        {workspace.libraryItems.map((item) => (
          <article className="page-card" key={item.id}>
            <span>{item.type}</span>
            <h3>{item.name}</h3>
            <p>{item.summary}</p>
          </article>
        ))}
      </div>
    </PageShell>
  );
}

export function PluginsPage() {
  const { workspace, refresh } = useWorkspace();

  async function toggle(plugin: Plugin) {
    await fetchJson<Plugin>(`/plugins/${plugin.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !plugin.enabled }),
    });
    await refresh();
  }

  return (
    <PageShell title="插件" description="管理外部工具连接能力。">
      <div className="page-card-grid">
        {workspace.plugins.map((plugin) => (
          <article className="page-card" key={plugin.id}>
            <span>{plugin.enabled ? "已启用" : "未启用"}</span>
            <h3>{plugin.name}</h3>
            <p>{plugin.description}</p>
            <button className="page-secondary-button" onClick={() => toggle(plugin)} type="button">
              {plugin.enabled ? "停用" : "启用"}
            </button>
          </article>
        ))}
      </div>
    </PageShell>
  );
}

export function AutomationPage() {
  const { workspace, refresh } = useWorkspace();
  const [projectId, setProjectId] = useState("proj-qihang-growth");
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [action, setAction] = useState("");

  async function addAutomation() {
    if (!name.trim() || !trigger.trim() || !action.trim()) return;
    await fetchJson<Automation>("/automations", {
      method: "POST",
      body: JSON.stringify({ projectId, name, trigger, action }),
    });
    setName("");
    setTrigger("");
    setAction("");
    await refresh();
  }

  async function toggle(automation: Automation) {
    await fetchJson<Automation>(`/automations/${automation.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !automation.enabled }),
    });
    await refresh();
  }

  return (
    <PageShell title="自动化" description="把诊断结果转成提醒、分配和同步规则。">
      <div className="page-form-grid">
        <select className="page-input" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          {workspace.projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
        <input className="page-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="规则名称" />
        <input className="page-input" value={trigger} onChange={(event) => setTrigger(event.target.value)} placeholder="触发条件" />
        <input className="page-input" value={action} onChange={(event) => setAction(event.target.value)} placeholder="执行动作" />
        <button className="page-primary-button" onClick={addAutomation} type="button">新增自动化</button>
      </div>
      <div className="page-list">
        {workspace.automations.map((automation) => (
          <div className="page-row" key={automation.id}>
            <span>{automation.enabled ? "运行中" : "已暂停"}</span>
            <strong>{automation.name}</strong>
            <p>{automation.trigger} → {automation.action}</p>
            <button className="page-secondary-button" onClick={() => toggle(automation)} type="button">
              {automation.enabled ? "暂停" : "启用"}
            </button>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function NewProjectPage() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [enterpriseId, setEnterpriseId] = useState("ent-qihang");
  const [enterpriseName, setEnterpriseName] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function create() {
    if (!name.trim()) return;
    const project = await fetchJson<Project>("/projects", {
      method: "POST",
      body: JSON.stringify({
        enterpriseId: enterpriseId === "new" ? undefined : enterpriseId,
        enterpriseName: enterpriseId === "new" ? enterpriseName : undefined,
        name,
        description,
      }),
    });
    router.push(`/projects/${project.id}`);
  }

  return (
    <PageShell title="新增项目" description="项目是企业下面的子集合，用来承载资料、对话、诊断和自动化。">
      <div className="page-form-grid">
        <select className="page-input" value={enterpriseId} onChange={(event) => setEnterpriseId(event.target.value)}>
          {workspace.enterprises.map((enterprise) => (
            <option key={enterprise.id} value={enterprise.id}>{enterprise.name}</option>
          ))}
          <option value="new">新增企业</option>
        </select>
        {enterpriseId === "new" && (
          <input className="page-input" value={enterpriseName} onChange={(event) => setEnterpriseName(event.target.value)} placeholder="企业名称" />
        )}
        <input className="page-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="项目名称，比如：线索增长" />
        <textarea className="page-textarea" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="项目目标，比如：减少顾问漏跟进，提高签约转化" />
        <button className="page-primary-button" onClick={create} type="button">创建项目</button>
      </div>
    </PageShell>
  );
}

export function ProjectDetailPage({ id }: { id: string }) {
  const { workspace } = useWorkspace();
  const project = workspace.projects.find((item) => item.id === id);
  const enterprise = project ? workspace.enterprises.find((item) => item.id === project.enterpriseId) : undefined;

  if (!project) {
    return <PageShell title="项目" description="正在加载项目详情。" />;
  }

  return (
    <PageShell title={`${enterprise?.name ?? "企业"} / ${project.name}`} description={project.description ?? "暂无项目说明。"}>
      <div className="page-stats">
        <Stat label="对话" value={workspace.conversations.filter((item) => item.projectId === id).length} />
        <Stat label="资料" value={workspace.libraryItems.filter((item) => item.projectId === id).length} />
        <Stat label="自动化" value={workspace.automations.filter((item) => item.projectId === id).length} />
      </div>
      <div className="page-card-grid">
        <article className="page-card">
          <span>子类</span>
          <h3>{project.name}</h3>
          <p>这是 {enterprise?.name} 下的项目子集合，后续新增的资料、对话和自动化都会归在这里。</p>
        </article>
      </div>
    </PageShell>
  );
}

function PageShell({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="page-shell">
      <header className="page-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="page-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
