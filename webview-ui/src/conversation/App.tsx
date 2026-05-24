import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ConversationHostMessage,
  ConversationLabels,
  ConversationStateSync,
  MentionAttachmentWire,
} from '@shared/conversationWebviewProtocol';
import { postToHost } from '../shared/vscode';

interface ChatLine {
  id: string;
  kind: 'user' | 'assistant' | 'meta';
  text: string;
}

let lineId = 0;
function nextLineId(): string {
  lineId += 1;
  return `line-${lineId}`;
}

const DEFAULT_LABELS: ConversationLabels = {
  userPrefix: 'You: ',
  assistantPrefix: 'Assistant: ',
  summarized: 'Summarized — {path}',
  streamComplete: 'Response complete.',
  streamCancelled: 'Response cancelled.',
  streamError: 'Request failed: {msg}',
  removeAttachment: 'Remove attachment',
  inputLabel: 'Design conversation input',
  inputPlaceholder: 'Describe your design… (@ to attach context)',
  send: 'Send',
  sendAria: 'Send message',
  attach: '@ Attach',
  attachAria: 'Attach context',
  cancel: 'Cancel',
  cancelAria: 'Cancel request',
  newSession: 'New Session',
  newSessionAria: 'New session',
  designStepLabel: 'Design step',
};

function formatAttachmentSuffix(attachments: MentionAttachmentWire[]): string {
  if (attachments.length === 0) {
    return '';
  }
  return ` [${attachments.map((a) => `@${a.kind}:${a.label}`).join(', ')}]`;
}

export function App(): JSX.Element {
  const [labels, setLabels] = useState<ConversationLabels>(DEFAULT_LABELS);
  const [stage, setStage] = useState('Design');
  const [readOnly, setReadOnly] = useState(false);
  const [readOnlyBanner, setReadOnlyBanner] = useState<string | undefined>();
  const [model, setModel] = useState('none');
  const [designStep, setDesignStep] = useState('');
  const [designStatus, setDesignStatus] = useState('');
  const [tokens, setTokens] = useState(0);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [attachments, setAttachments] = useState<MentionAttachmentWire[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const a11yRef = useRef<HTMLDivElement>(null);

  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  const announce = useCallback((message: string) => {
    const node = a11yRef.current;
    if (!node) {
      return;
    }
    node.textContent = '';
    requestAnimationFrame(() => {
      node.textContent = message;
    });
  }, []);

  const applyStateSync = useCallback((msg: ConversationStateSync) => {
    setStage(msg.stage);
    setReadOnly(msg.readOnly);
    setReadOnlyBanner(msg.readOnlyBanner);
    setModel(msg.model);
    setDesignStep(msg.designStep);
    setTokens(msg.tokens);
    setLabels(msg.labels);
    setDesignStatus('');
    if (msg.resetMessages) {
      setLines([]);
      setAttachments([]);
      setInput('');
      setStreaming(false);
      setStreamText('');
    }
  }, []);

  useEffect(() => {
    postToHost({ type: 'ready' });

    const onMessage = (event: MessageEvent<ConversationHostMessage>) => {
      const msg = event.data;
      if (!msg?.type) {
        return;
      }

      if (msg.type === 'stateSync') {
        applyStateSync(msg);
        return;
      }

      if (msg.type === 'userMessage') {
        const L = labelsRef.current;
        setLines((prev) => [
          ...prev,
          {
            id: nextLineId(),
            kind: 'user',
            text: L.userPrefix + msg.text + formatAttachmentSuffix(msg.attachments ?? []),
          },
        ]);
        return;
      }

      if (msg.type === 'mentionAttached') {
        setAttachments((prev) => [...prev, msg.mention]);
        return;
      }

      if (msg.type === 'summarized') {
        const L = labelsRef.current;
        setLines((prev) => [
          ...prev,
          {
            id: nextLineId(),
            kind: 'meta',
            text: `⟳ ${L.summarized.replace('{path}', msg.path)}`,
          },
        ]);
        return;
      }

      if (msg.type === 'streamStart') {
        setStreaming(true);
        setStreamText('');
        return;
      }

      if (msg.type === 'streamChunk') {
        setStreamText((prev) => prev + msg.text);
        return;
      }

      if (msg.type === 'designStatus') {
        setDesignStatus(msg.message);
        return;
      }

      if (msg.type === 'tokenUpdate') {
        setTokens(msg.tokens);
        return;
      }

      if (msg.type === 'streamEnd') {
        const L = labelsRef.current;
        setStreaming(false);
        setDesignStatus('');
        setTokens(msg.tokens);
        setStreamText('');
        setLines((prev) => [
          ...prev,
          { id: nextLineId(), kind: 'assistant', text: L.assistantPrefix + msg.text },
        ]);
        announce(L.streamComplete);
        return;
      }

      if (msg.type === 'streamCancelled') {
        announce(labelsRef.current.streamCancelled);
        setStreaming(false);
        setStreamText('');
        return;
      }

      if (msg.type === 'error') {
        const L = labelsRef.current;
        setStreaming(false);
        setStreamText('');
        announce(L.streamError.replace('{msg}', msg.message || ''));
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [announce, applyStateSync]);

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    if (!readOnly) {
      postToHost({ type: 'inputDraft', text: value, attachments: attachments.slice() });
    }
  };

  const handleSend = () => {
    if (streaming || readOnly) {
      return;
    }
    const text = input.trim();
    if (!text && attachments.length === 0) {
      return;
    }
    const sentAttachments = attachments.slice();
    setInput('');
    setAttachments([]);
    setStreaming(true);
    postToHost({ type: 'submit', text, attachments: sentAttachments });
  };

  const handleNewSession = () => {
    setLines([]);
    setAttachments([]);
    setInput('');
    setTokens(0);
    postToHost({ type: 'newSession' });
  };

  return (
    <div className="conversation-root">
      {readOnly && readOnlyBanner ? (
        <div className="banner" role="status">
          {readOnlyBanner}
        </div>
      ) : null}

      <header className="conversation-header">
        Model: {model} · Stage: {stage} · {labels.designStepLabel}: {designStep} · Tokens:{' '}
        {tokens}
        {designStatus ? (
          <span className="conversation-design-status">{designStatus}</span>
        ) : null}
      </header>

      <div
        ref={a11yRef}
        className="sr-only"
        role="status"
        aria-live="assertive"
        aria-atomic="true"
      />

      <div className="conversation-messages" role="log" aria-live="polite" aria-relevant="additions">
        {lines.map((line) => (
          <div
            key={line.id}
            className={
              line.kind === 'meta'
                ? 'conversation-message conversation-message--meta'
                : 'conversation-message'
            }
          >
            {line.text}
          </div>
        ))}
        {streaming ? (
          <div className="conversation-message">{labels.assistantPrefix + streamText}</div>
        ) : null}
      </div>

      <div className="conversation-attachments">
        {attachments.map((attachment, index) => (
          <span key={`${attachment.kind}-${attachment.target}-${index}`} className="conversation-attachment">
            @{attachment.kind}:{attachment.label}
            <button
              type="button"
              aria-label={labels.removeAttachment}
              onClick={() => removeAttachment(index)}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <textarea
        className="conversation-input"
        rows={3}
        value={input}
        disabled={readOnly}
        aria-disabled={readOnly}
        aria-label={labels.inputLabel}
        placeholder={labels.inputPlaceholder}
        onChange={(event) => handleInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === '@' && !readOnly) {
            event.preventDefault();
            postToHost({ type: 'pickMention' });
          }
        }}
      />

      <div className="conversation-actions">
        <button type="button" disabled={readOnly || streaming} aria-label={labels.sendAria} onClick={handleSend}>
          {labels.send}
        </button>
        <button
          type="button"
          disabled={readOnly}
          aria-label={labels.attachAria}
          onClick={() => postToHost({ type: 'pickMention' })}
        >
          {labels.attach}
        </button>
        <button
          type="button"
          disabled={readOnly || !streaming}
          aria-label={labels.cancelAria}
          onClick={() => postToHost({ type: 'cancel' })}
        >
          {labels.cancel}
        </button>
        <button type="button" aria-label={labels.newSessionAria} onClick={handleNewSession}>
          {labels.newSession}
        </button>
      </div>
    </div>
  );
}
