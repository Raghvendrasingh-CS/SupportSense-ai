// New ticket submission form for manual ticket creation and pipeline trigger.
import { useState } from 'react';

const DEMO_SUBJECTS = [
  { subject: 'Cannot access SharePoint project site — Access Denied', description: 'Getting access denied when trying to open the Contoso Project Alpha SharePoint site.', requesterId: 'user-001' },
  { subject: 'Outlook calendar not syncing with mobile', description: 'Calendar events on desktop are not appearing on iPhone Outlook app.', requesterId: 'user-002' },
  { subject: 'Teams audio cutting out during calls', description: 'Audio drops every few minutes during Teams video calls. Blocking client meetings.', requesterId: 'user-003' },
  { subject: 'VPN connection failing after password reset', description: 'Reset my password yesterday, now VPN will not connect. Error code 809.', requesterId: 'user-001' },
];

export default function NewTicketForm({ onSubmit, loading }) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [requesterId, setRequesterId] = useState('user-001');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!subject.trim()) return;
      console.log(`[NewTicketForm] ${new Date().toISOString()} Submitting ticket`);
      await onSubmit({ subject, description, requesterId });
      setSubject('');
      setDescription('');
    } catch (error) {
      console.error(`[NewTicketForm] ${new Date().toISOString()} ERROR:`, error);
    }
  };

  const fillDemo = (demo) => {
    setSubject(demo.subject);
    setDescription(demo.description);
    setRequesterId(demo.requesterId);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Submit New Ticket</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Describe the issue briefly..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ms-blue focus:border-transparent"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Provide details about the issue..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ms-blue focus:border-transparent resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Requester</label>
          <select
            value={requesterId}
            onChange={(e) => setRequesterId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ms-blue"
          >
            <option value="user-001">Sarah Chen (Engineering)</option>
            <option value="user-002">Marcus Webb (Finance)</option>
            <option value="user-003">Elena Rodriguez (Operations)</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading || !subject.trim()}
          className="w-full py-2.5 bg-ms-blue text-white text-sm font-medium rounded-lg hover:bg-ms-dark transition-colors disabled:opacity-50"
        >
          {loading ? 'Processing Pipeline...' : 'Submit & Process'}
        </button>
      </form>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-500 mb-2">Quick fill:</p>
        <div className="flex flex-wrap gap-2">
          {DEMO_SUBJECTS.map((demo, i) => (
            <button
              key={i}
              type="button"
              onClick={() => fillDemo(demo)}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
            >
              {demo.subject.slice(0, 30)}...
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
