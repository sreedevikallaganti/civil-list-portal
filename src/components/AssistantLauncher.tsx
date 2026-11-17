'use client';

/* ================================================================
   AssistantLauncher — the "Ask AI" button in the bottom-right corner
   of every signed-in page (mounted once in AppShell), and its drawer.

   • Shown to people who can edit meetings, when an AI service is set up
     (admins also see it without one, to get the setup note).
   • Other places open it with askAI('question') — e.g. Ctrl/Cmd+K on the
     Meetings page.
   • A draft from the assistant opens the New Meeting form on the Meetings
     page (/meetings?aidraft=…), from whichever page it was asked on.
================================================================ */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canEdit, canManageIntegrations } from '@/lib/roles';
import AssistantDrawer, { useAssistantEnabled } from '@/components/meetings/AssistantDrawer';
import type { MeetingDraft } from '@/lib/ai/assistantTools';

const ASK_AI_EVENT = 'civ:ask-ai';

/** Open the assistant from anywhere, optionally with a question to send straight away. */
export function askAI(question = '') {
  window.dispatchEvent(new CustomEvent(ASK_AI_EVENT, { detail: { question } }));
}

export default function AssistantLauncher() {
  const { user } = useAuth();
  const router = useRouter();
  const editable = canEdit(user);
  const isAdmin = canManageIntegrations(user);
  const enabled = useAssistantEnabled(editable);

  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');

  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = String((e as CustomEvent<{ question?: string }>).detail?.question || '').trim();
      if (q) setQuestion(q);
      setOpen(true);
    };
    window.addEventListener(ASK_AI_EVENT, onAsk);
    return () => window.removeEventListener(ASK_AI_EVENT, onAsk);
  }, []);

  if (!editable || !(enabled === true || (enabled === false && isAdmin))) return null;

  function openDraft(d: MeetingDraft) {
    setOpen(false);
    router.push(`/meetings?aidraft=${encodeURIComponent(JSON.stringify(d))}`);
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask AI"
          title="Ask AI — find officers, batchmates, who you've met, and draft meetings"
          style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
          className="group fixed right-5 z-[45] inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 p-3.5 text-white shadow-xl shadow-violet-600/30 ring-1 ring-white/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-violet-600/40 active:scale-95 sm:px-4 sm:py-3"
        >
          <Sparkles className="h-5 w-5 transition-transform duration-300 group-hover:rotate-12" />
          <span className="hidden text-sm font-semibold sm:inline">Ask AI</span>
        </button>
      )}
      <AssistantDrawer
        open={open}
        onClose={() => setOpen(false)}
        enabled={enabled}
        isAdmin={isAdmin}
        question={question}
        onOpenDraft={openDraft}
      />
    </>
  );
}
