import { useState } from "react";

export default function RoleManagerModal({ onClose, onAssignRole }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      await onAssignRole(email, role);
      setMessage(`Role '${role}' saved for ${email.trim().toLowerCase()}`);
      setEmail("");
      setRole("user");
    } catch (err) {
      setError(err?.message || "Failed to assign role.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="role-modal-backdrop" onClick={onClose}>
      <div className="role-modal f-up" onClick={(event) => event.stopPropagation()}>
        <div className="role-modal__header">
          <div>
            <div className="role-modal__title">Manage Roles</div>
            <div className="role-modal__subtitle">Root can assign only user/admin roles.</div>
          </div>
          <button className="role-modal__close" onClick={onClose}>x</button>
        </div>

        <form className="role-modal__form" onSubmit={handleSubmit}>
          <label className="role-modal__label" htmlFor="role-email-input">User email</label>
          <input
            id="role-email-input"
            type="email"
            className="role-modal__input"
            placeholder="user@gmail.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={isSaving}
          />

          <label className="role-modal__label" htmlFor="role-select-input">Role</label>
          <select
            id="role-select-input"
            className="role-modal__select"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            disabled={isSaving}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>

          {error && <div className="role-modal__error">{error}</div>}
          {message && <div className="role-modal__success">{message}</div>}

          <button type="submit" className="role-modal__submit btn-p" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save role"}
          </button>
        </form>
      </div>
    </div>
  );
}
