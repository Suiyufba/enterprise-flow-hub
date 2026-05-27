"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useToast } from "../lib/toast-context";
import { useWorkspace } from "../lib/workspace-context";
import type { Department, User } from "shared";

interface DepartmentWithChildren extends Department {
  children: DepartmentWithChildren[];
  members: User[];
}

function DepartmentTreeNode({
  dept,
  allDepartments,
  allUsers,
  isAdmin,
  onAddDept,
  onEditDept,
  onDeleteDept,
  onAddUser,
  onEditUser,
  onDeleteUser,
  depth,
}: {
  dept: DepartmentWithChildren;
  allDepartments: Department[];
  allUsers: User[];
  isAdmin: boolean;
  onAddDept: (parentId: string) => void;
  onEditDept: (dept: Department) => void;
  onDeleteDept: (dept: Department) => void;
  onAddUser: (deptId: string) => void;
  onEditUser: (user: User) => void;
  onDeleteUser: (user: User) => void;
  depth: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = dept.children.length > 0 || dept.members.length > 0;

  return (
    <div className="org-node-group">
      <div className="org-node-row">
        {depth > 0 && <div className="org-connector-line" />}
        <div className={`org-dept-card ${isAdmin ? "admin" : ""}`}>
          <div className="org-dept-header">
            {hasChildren && (
              <button
                className="org-collapse-btn"
                onClick={() => setCollapsed(!collapsed)}
                type="button"
              >
                <span className={`tree-chevron ${!collapsed ? "open" : ""}`}>▸</span>
              </button>
            )}
            <span className="org-dept-icon">🏢</span>
            <span className="org-dept-name">{dept.name}</span>
            <span className="org-dept-count">
              {dept.members.length + dept.children.reduce((s, c) => s + c.members.length, 0)}人
            </span>
            {isAdmin && (
              <div className="org-dept-actions">
                <button onClick={() => onAddDept(dept.id)} title="添加子部门" type="button">+部门</button>
                <button onClick={() => onAddUser(dept.id)} title="添加成员" type="button">+成员</button>
                <button onClick={() => onEditDept(dept)} title="编辑" type="button">✏</button>
                <button onClick={() => onDeleteDept(dept)} className="danger" title="删除" type="button">×</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!collapsed && (
        <div className="org-children">
          {/* Members first */}
          {dept.members.map((user) => (
            <div className="org-node-row" key={user.id}>
              <div className="org-connector-line" />
              <div className={`org-user-card ${isAdmin ? "admin" : ""}`}>
                <span className="org-user-avatar">👤</span>
                <div className="org-user-info">
                  <span className="org-user-name">{user.displayName}</span>
                  <span className="org-user-pos">{user.position || "未设置职位"}</span>
                  <span className="org-user-role-tag">{user.role === "admin" ? "管理员" : "成员"}</span>
                </div>
                {isAdmin && (
                  <div className="org-user-actions">
                    <button onClick={() => onEditUser(user)} title="编辑" type="button">✏</button>
                    <button onClick={() => onDeleteUser(user)} className="danger" title="删除" type="button">×</button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Then sub-departments */}
          {dept.children.map((child) => (
            <DepartmentTreeNode
              key={child.id}
              dept={child}
              allDepartments={allDepartments}
              allUsers={allUsers}
              isAdmin={isAdmin}
              onAddDept={onAddDept}
              onEditDept={onEditDept}
              onDeleteDept={onDeleteDept}
              onAddUser={onAddUser}
              onEditUser={onEditUser}
              onDeleteUser={onDeleteUser}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {/* Members without department */}
      {depth === 0 && allUsers.filter((u) => !u.departmentId).length > 0 && (
        <div className="org-children">
          <div className="org-unassigned-label">未分配部门</div>
          {allUsers.filter((u) => !u.departmentId).map((user) => (
            <div className="org-node-row" key={user.id}>
              <div className="org-connector-line" />
              <div className={`org-user-card ${isAdmin ? "admin" : ""}`}>
                <span className="org-user-avatar">👤</span>
                <div className="org-user-info">
                  <span className="org-user-name">{user.displayName}</span>
                  <span className="org-user-pos">{user.position || "未设置职位"}</span>
                  <span className="org-user-role-tag">{user.role === "admin" ? "管理员" : "成员"}</span>
                </div>
                {isAdmin && (
                  <div className="org-user-actions">
                    <button onClick={() => onEditUser(user)} title="编辑" type="button">✏</button>
                    <button onClick={() => onDeleteUser(user)} className="danger" title="删除" type="button">×</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EnterprisePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { workspace, refresh } = useWorkspace();
  const { showToast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [deptForm, setDeptForm] = useState<{
    open: boolean;
    editing?: Department;
    parentId?: string;
    name: string;
  }>({ open: false, name: "" });

  const [userForm, setUserForm] = useState<{
    open: boolean;
    editing?: User;
    deptId?: string;
    username: string;
    password: string;
    displayName: string;
    role: "member" | "admin";
    departmentId: string;
    position: string;
  }>({ open: false, username: "", password: "", displayName: "", role: "member", departmentId: "", position: "" });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    type: "dept" | "user";
    id: string;
    name: string;
  }>({ open: false, type: "dept", id: "", name: "" });

  const [processing, setProcessing] = useState(false);

  const isAdmin = user?.role === "admin";
  const enterpriseId = user?.enterpriseId ?? workspace.enterprises[0]?.id;

  const loadData = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    try {
      const [deps, usrs] = await Promise.all([
        fetchJson<Department[]>(`/departments?enterpriseId=${enterpriseId}`),
        fetchJson<User[]>(`/users?enterpriseId=${enterpriseId}`),
      ]);
      setDepartments(deps);
      setUsers(usrs);
    } catch {
      showToast("加载企业数据失败", "error");
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, showToast]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    loadData();
  }, [authLoading, user, router, loadData]);

  const tree = useMemo(() => {
    const deptMap = new Map<string, DepartmentWithChildren>();
    const roots: DepartmentWithChildren[] = [];

    for (const d of departments) {
      deptMap.set(d.id, { ...d, children: [], members: [] });
    }
    for (const u of users) {
      if (u.departmentId && deptMap.has(u.departmentId)) {
        deptMap.get(u.departmentId)!.members.push(u);
      }
    }
    for (const d of deptMap.values()) {
      if (d.parentId && deptMap.has(d.parentId)) {
        deptMap.get(d.parentId)!.children.push(d);
      } else if (!d.parentId) {
        roots.push(d);
      }
    }
    return roots;
  }, [departments, users]);

  async function handleSaveDept() {
    if (!deptForm.name.trim() || !enterpriseId) return;
    setProcessing(true);
    try {
      if (deptForm.editing) {
        await fetchJson(`/departments/${deptForm.editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: deptForm.name.trim() }),
          adminUserId: user?.id,
        });
        showToast("部门已更新", "success");
      } else {
        await fetchJson("/departments", {
          method: "POST",
          body: JSON.stringify({
            enterpriseId,
            parentId: deptForm.parentId || undefined,
            name: deptForm.name.trim(),
          }),
          adminUserId: user?.id,
        });
        showToast("部门已创建", "success");
      }
      setDeptForm({ open: false, name: "" });
      await loadData();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "操作失败", "error");
    } finally {
      setProcessing(false);
    }
  }

  async function handleSaveUser() {
    if (!userForm.displayName.trim() || !enterpriseId) return;
    setProcessing(true);
    try {
      if (userForm.editing) {
        await fetchJson(`/users/${userForm.editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            displayName: userForm.displayName.trim(),
            role: userForm.role,
            departmentId: userForm.departmentId || null,
            position: userForm.position.trim() || null,
          }),
          adminUserId: user?.id,
        });
        showToast("用户已更新", "success");
      } else {
        if (!userForm.username.trim() || !userForm.password.trim()) {
          showToast("用户名和密码不能为空", "error");
          return;
        }
        await fetchJson("/users", {
          method: "POST",
          body: JSON.stringify({
            enterpriseId,
            username: userForm.username.trim(),
            password: userForm.password,
            displayName: userForm.displayName.trim(),
            role: userForm.role,
            departmentId: userForm.departmentId || undefined,
            position: userForm.position.trim() || undefined,
          }),
          adminUserId: user?.id,
        });
        showToast("用户已创建", "success");
      }
      setUserForm({ open: false, username: "", password: "", displayName: "", role: "member", departmentId: "", position: "" });
      await loadData();
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "操作失败", "error");
    } finally {
      setProcessing(false);
    }
  }

  async function handleDelete() {
    setProcessing(true);
    try {
      if (deleteConfirm.type === "dept") {
        await fetchJson(`/departments/${deleteConfirm.id}`, {
          method: "DELETE",
          adminUserId: user?.id,
        });
        showToast("部门已删除", "success");
      } else {
        await fetchJson(`/users/${deleteConfirm.id}`, {
          method: "DELETE",
          adminUserId: user?.id,
        });
        showToast("用户已删除", "success");
      }
      setDeleteConfirm({ open: false, type: "dept", id: "", name: "" });
      await loadData();
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "删除失败", "error");
    } finally {
      setProcessing(false);
    }
  }

  function openAddDept(parentId?: string) {
    setDeptForm({ open: true, parentId, name: "" });
  }

  function openEditDept(dept: Department) {
    setDeptForm({ open: true, editing: dept, name: dept.name });
  }

  function openAddUser(deptId?: string) {
    setUserForm({
      open: true,
      deptId,
      username: "",
      password: "",
      displayName: "",
      role: "member",
      departmentId: deptId || "",
      position: "",
    });
  }

  function openEditUser(u: User) {
    setUserForm({
      open: true,
      editing: u,
      username: u.username,
      password: "",
      displayName: u.displayName,
      role: u.role,
      departmentId: u.departmentId || "",
      position: u.position || "",
    });
  }

  if (authLoading || loading) {
    return (
      <div className="main">
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="main enterprise-page">
      <div className="page-shell">
        <div className="page-header">
          <h1>企业管理</h1>
          <p>组织架构一目了然，高效管理团队</p>
        </div>

        {/* Stats row */}
        <div className="page-stats">
          <div className="page-stat">
            <span>部门</span>
            <strong>{departments.length}</strong>
          </div>
          <div className="page-stat">
            <span>成员</span>
            <strong>{users.length}</strong>
          </div>
          <div className="page-stat">
            <span>管理员</span>
            <strong>{users.filter((u) => u.role === "admin").length}</strong>
          </div>
        </div>

        {/* Org Chart */}
        <div className="org-chart-container">
          <div className="org-chart-header">
            <h2>组织架构图</h2>
            {isAdmin && (
              <button
                className="page-secondary-button"
                onClick={() => openAddDept()}
                type="button"
                disabled={processing}
              >
                + 新建部门
              </button>
            )}
          </div>

          <div className="org-chart">
            {tree.length === 0 && users.length === 0 ? (
              <div className="org-empty">
                <p>还没有组织架构</p>
                {isAdmin && (
                  <button className="page-primary-button" onClick={() => openAddDept()} type="button">
                    创建第一个部门
                  </button>
                )}
              </div>
            ) : tree.length === 0 ? (
              <div className="org-empty">
                <p>还没有部门，所有成员尚未分配</p>
                {isAdmin && (
                  <div className="org-empty-actions">
                    <button className="page-primary-button" onClick={() => openAddDept()} type="button">创建部门</button>
                    <button className="page-secondary-button" onClick={() => openAddUser()} type="button">添加成员</button>
                  </div>
                )}
                <div className="org-flat-list">
                  {users.map((u) => (
                    <div className={`org-user-card standalone ${isAdmin ? "admin" : ""}`} key={u.id}>
                      <span className="org-user-avatar">👤</span>
                      <div className="org-user-info">
                        <span className="org-user-name">{u.displayName}</span>
                        <span className="org-user-pos">{u.position || "未设置职位"}</span>
                      </div>
                      {isAdmin && (
                        <div className="org-user-actions">
                          <button onClick={() => openEditUser(u)} title="编辑" type="button">✏</button>
                          <button onClick={() => setDeleteConfirm({ open: true, type: "user", id: u.id, name: u.displayName })} className="danger" title="删除" type="button">×</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              tree.map((root) => (
                <DepartmentTreeNode
                  key={root.id}
                  dept={root}
                  allDepartments={departments}
                  allUsers={users}
                  isAdmin={isAdmin}
                  onAddDept={openAddDept}
                  onEditDept={openEditDept}
                  onDeleteDept={(d) => setDeleteConfirm({ open: true, type: "dept", id: d.id, name: d.name })}
                  onAddUser={openAddUser}
                  onEditUser={openEditUser}
                  onDeleteUser={(u) => setDeleteConfirm({ open: true, type: "user", id: u.id, name: u.displayName })}
                  depth={0}
                />
              ))
            )}
          </div>
        </div>

        {/* Department Form Modal */}
        {deptForm.open && (
          <div className="modal-overlay" onClick={() => setDeptForm({ open: false, name: "" })}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>{deptForm.editing ? "编辑部门" : "新建部门"}</h3>
              <div className="modal-body">
                <label className="form-label">部门名称</label>
                <input
                  className="page-input"
                  autoFocus
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveDept()}
                  placeholder="例如：技术部"
                />
              </div>
              <div className="modal-actions">
                <button className="page-secondary-button" onClick={() => setDeptForm({ open: false, name: "" })} type="button" disabled={processing}>取消</button>
                <button className="page-primary-button" onClick={handleSaveDept} type="button" disabled={processing || !deptForm.name.trim()}>
                  {processing ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* User Form Modal */}
        {userForm.open && (
          <div className="modal-overlay" onClick={() => setUserForm({ open: false, username: "", password: "", displayName: "", role: "member", departmentId: "", position: "" })}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>{userForm.editing ? "编辑成员" : "添加成员"}</h3>
              <div className="modal-body">
                {!userForm.editing && (
                  <>
                    <label className="form-label">用户名</label>
                    <input
                      className="page-input"
                      autoFocus
                      value={userForm.username}
                      onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      placeholder="登录用户名"
                    />
                    <label className="form-label">密码</label>
                    <input
                      className="page-input"
                      type="password"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      placeholder="至少4位"
                    />
                  </>
                )}
                <label className="form-label">显示名称</label>
                <input
                  className="page-input"
                  autoFocus={!!userForm.editing}
                  value={userForm.displayName}
                  onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveUser()}
                  placeholder="例如：张三"
                />
                <label className="form-label">职位</label>
                <input
                  className="page-input"
                  value={userForm.position}
                  onChange={(e) => setUserForm({ ...userForm, position: e.target.value })}
                  placeholder="例如：前端工程师"
                />
                <label className="form-label">所属部门</label>
                <select
                  className="page-input"
                  value={userForm.departmentId}
                  onChange={(e) => setUserForm({ ...userForm, departmentId: e.target.value })}
                >
                  <option value="">无</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <label className="form-label">角色</label>
                <select
                  className="page-input"
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value as "member" | "admin" })}
                >
                  <option value="member">成员</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div className="modal-actions">
                <button className="page-secondary-button" onClick={() => setUserForm({ open: false, username: "", password: "", displayName: "", role: "member", departmentId: "", position: "" })} type="button" disabled={processing}>取消</button>
                <button className="page-primary-button" onClick={handleSaveUser} type="button" disabled={processing || !userForm.displayName.trim()}>
                  {processing ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm */}
        {deleteConfirm.open && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm({ open: false, type: "dept", id: "", name: "" })}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>确认删除</h3>
              <p className="modal-text">
                确定要删除{deleteConfirm.type === "dept" ? "部门" : "用户"}「{deleteConfirm.name}」吗？此操作不可撤销。
                {deleteConfirm.type === "dept" && "子部门将上移，成员将取消分配。"}
              </p>
              <div className="modal-actions">
                <button className="page-secondary-button" onClick={() => setDeleteConfirm({ open: false, type: "dept", id: "", name: "" })} type="button" disabled={processing}>取消</button>
                <button className="page-primary-button" onClick={handleDelete} type="button" disabled={processing} style={{ background: "var(--c-d20f39)", color: "#fff" }}>
                  {processing ? "删除中..." : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
