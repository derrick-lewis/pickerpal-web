import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createQuiz,
  fetchLatestQuiz,
  fetchQuizCandidates,
  fetchQuizDistractors,
  publishQuiz,
  type CreateQuizQuestionInput,
  type LatestQuiz,
  type QuizCandidate,
  type QuizDistractor,
  type QuizObscureRect,
} from '../api/admin';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AuthImage } from '../components/AuthImage';
import { formatDateTime } from '../lib/format';

/** One id+label pair for the category filter chips, collected from loaded candidates. */
interface CategoryChip {
  id: string;
  label: string;
}

/** A question being composed, before it's ever sent to the server. */
interface DraftQuestion {
  /** Client-only key (the candidate's itemId, which is unique per candidate list). */
  key: string;
  photoItemId: string;
  photoId: string;
  makerId: string;
  makerName: string;
  categoryId: string | null;
  categoryName: string | null;
  obscureRect: QuizObscureRect | null;
  distractors: QuizDistractor[];
  distractorsLoading: boolean;
  distractorsError: string | null;
}

/** The Monday on or after `today` -- the curation screen's default weekOf. */
function nextMonday(today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const daysUntilMonday = day === 1 ? 7 : ((8 - day) % 7 || 7);
  d.setDate(d.getDate() + daysUntilMonday);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Second Opinions' weekly quiz curation (pickerpal-api internal/quiz,
 * migration 000029): browse clean, already-attributed finds, pick which
 * ones become questions, draw an obscure box over the mark, review the
 * auto-suggested wrong answers, then save a draft and publish it. Same
 * shell idiom as the Makers tab above (load on mount, per-action busy/error
 * state) with its own two-part layout: a candidate browser feeding a
 * question basket, and a "latest quiz" status panel below it.
 */
export function AdminQuizTab() {
  const { token } = useAuth();

  // --- candidates ---
  const [candidates, setCandidates] = useState<QuizCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const loadCandidates = useCallback(
    (categoryId: string | null) => {
      if (!token) return;
      setCandidatesLoading(true);
      setCandidatesError(null);
      fetchQuizCandidates(token, categoryId)
        .then(setCandidates)
        .catch((err) => setCandidatesError(err instanceof ApiError ? err.message : 'Failed to load candidates.'))
        .finally(() => setCandidatesLoading(false));
    },
    [token],
  );

  useEffect(() => {
    loadCandidates(null);
    // Only the initial mount needs the unfiltered load; category chip
    // clicks call loadCandidates directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryChips: CategoryChip[] = [];
  const seenCategories = new Set<string>();
  for (const c of candidates) {
    if (c.categoryId && c.categoryName && !seenCategories.has(c.categoryId)) {
      seenCategories.add(c.categoryId);
      categoryChips.push({ id: c.categoryId, label: c.categoryName });
    }
  }
  categoryChips.sort((a, b) => a.label.localeCompare(b.label));

  function selectCategory(id: string) {
    const next = id === '' ? null : id;
    setCategoryFilter(next);
    loadCandidates(next);
  }

  // --- draft basket ---
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [weekOf, setWeekOf] = useState(() => nextMonday());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedQuizId, setSavedQuizId] = useState<string | null>(null);

  const loadDistractors = useCallback(
    (key: string, makerId: string, categoryId: string | null) => {
      if (!token) return;
      setQuestions((prev) =>
        prev.map((q) => (q.key === key ? { ...q, distractorsLoading: true, distractorsError: null } : q)),
      );
      fetchQuizDistractors(token, makerId, categoryId)
        .then((distractors) => {
          setQuestions((prev) =>
            prev.map((q) => (q.key === key ? { ...q, distractors, distractorsLoading: false } : q)),
          );
        })
        .catch((err) => {
          setQuestions((prev) =>
            prev.map((q) =>
              q.key === key
                ? {
                    ...q,
                    distractorsLoading: false,
                    distractorsError: err instanceof ApiError ? err.message : 'Failed to load distractors.',
                  }
                : q,
            ),
          );
        });
    },
    [token],
  );

  function addCandidate(candidate: QuizCandidate) {
    if (questions.some((q) => q.key === candidate.itemId)) return; // already added
    const draft: DraftQuestion = {
      key: candidate.itemId,
      photoItemId: candidate.itemId,
      photoId: candidate.firstPhotoId,
      makerId: candidate.makerId,
      makerName: candidate.makerName,
      categoryId: candidate.categoryId,
      categoryName: candidate.categoryName,
      obscureRect: null,
      distractors: [],
      distractorsLoading: true,
      distractorsError: null,
    };
    setQuestions((prev) => [...prev, draft]);
    loadDistractors(draft.key, draft.makerId, draft.categoryId);
    setSavedQuizId(null); // the basket changed; the last save no longer reflects it
  }

  function removeQuestion(key: string) {
    setQuestions((prev) => prev.filter((q) => q.key !== key));
    setSavedQuizId(null);
  }

  function setObscureRect(key: string, rect: QuizObscureRect | null) {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, obscureRect: rect } : q)));
  }

  async function handleSaveDraft() {
    if (!token || questions.length === 0) return;
    setSaving(true);
    setSaveError(null);
    const payload: CreateQuizQuestionInput[] = questions.map((q) => ({
      photoItemId: q.photoItemId,
      photoId: q.photoId,
      obscureRect: q.obscureRect,
      correctMakerId: q.makerId,
      distractorMakerIds: q.distractors.map((d) => d.makerId),
      categoryId: q.categoryId,
    }));
    try {
      const res = await createQuiz(token, weekOf, payload);
      setSavedQuizId(res.id);
      loadLatest();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save the draft.');
    } finally {
      setSaving(false);
    }
  }

  // --- latest quiz status ---
  const [latest, setLatest] = useState<LatestQuiz | null>(null);
  const [latestLoading, setLatestLoading] = useState(true);
  const [latestError, setLatestError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const loadLatest = useCallback(() => {
    if (!token) return;
    setLatestLoading(true);
    setLatestError(null);
    fetchLatestQuiz(token)
      .then((res) => setLatest(res.quiz))
      .catch((err) => setLatestError(err instanceof ApiError ? err.message : 'Failed to load the latest quiz.'))
      .finally(() => setLatestLoading(false));
  }, [token]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  async function handlePublish() {
    if (!token || !latest || latest.published) return;
    if (!window.confirm(`Publish the quiz for the week of ${latest.weekOf}? This makes it visible to every Plus viewer.`)) {
      return;
    }
    setPublishing(true);
    setPublishError(null);
    try {
      await publishQuiz(token, latest.id);
      loadLatest();
    } catch (err) {
      setPublishError(err instanceof ApiError ? err.message : 'Failed to publish.');
    } finally {
      setPublishing(false);
    }
  }

  const canPublish = latest !== null && !latest.published && (savedQuizId === null || savedQuizId === latest.id);

  return (
    <div>
      <div className="mod-header">
        <h1>Quiz</h1>
        <div className="mod-header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => loadCandidates(categoryFilter)} disabled={candidatesLoading}>
            {candidatesLoading ? 'Refreshing…' : 'Refresh candidates'}
          </button>
        </div>
      </div>
      <p className="mod-blurb">
        Pick clean, already-attributed finds to quiz other pickers on. Draw a box over the mark that gives it away,
        review the auto-suggested wrong answers, then save a draft and publish it.
      </p>

      <h2 className="mod-subheading">Candidates</h2>
      {categoryChips.length > 1 && (
        <select
          className="filter-select"
          value={categoryFilter ?? ''}
          onChange={(e) => selectCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {categoryChips.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      {candidatesError && <p className="error-banner">{candidatesError}</p>}
      {candidatesLoading ? (
        <p className="loading-state">Loading…</p>
      ) : candidates.length === 0 ? (
        <div className="empty-state">
          <span className="empty-glyph" aria-hidden="true">
            🖼️
          </span>
          <p className="empty-title">No clean candidates right now.</p>
        </div>
      ) : (
        <div className="quiz-candidate-grid">
          {candidates.map((c) => {
            const added = questions.some((q) => q.key === c.itemId);
            return (
              <button
                type="button"
                key={c.itemId}
                className={`quiz-candidate ${added ? 'quiz-candidate--added' : ''}`}
                onClick={() => addCandidate(c)}
                disabled={added}
              >
                <div className="quiz-candidate-thumb">
                  <AuthImage
                    photoId={c.firstPhotoId}
                    basePath="/v1/admin/moderation/photos"
                    variant="thumb"
                    alt=""
                    fallback={
                      <span className="placeholder" aria-hidden="true">
                        🖼️
                      </span>
                    }
                  />
                </div>
                <span className="quiz-candidate-maker">{c.makerName}</span>
                {added && <span className="quiz-candidate-badge">Added</span>}
              </button>
            );
          })}
        </div>
      )}

      <h2 className="mod-subheading">This week&rsquo;s questions ({questions.length})</h2>
      {questions.length === 0 ? (
        <p className="mod-blurb">Tap a candidate above to add it as a question.</p>
      ) : (
        <div className="mod-list">
          {questions.map((q, i) => (
            <QuestionCard
              key={q.key}
              index={i}
              question={q}
              onRemove={() => removeQuestion(q.key)}
              onRectChange={(rect) => setObscureRect(q.key, rect)}
              onReroll={() => loadDistractors(q.key, q.makerId, q.categoryId)}
            />
          ))}
        </div>
      )}

      <div className="quiz-save-row">
        <label className="quiz-week-label">
          Week of
          <input type="date" value={weekOf} onChange={(e) => setWeekOf(e.target.value)} className="quiz-week-input" />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || questions.length === 0 || questions.some((q) => q.distractorsLoading || q.distractors.length !== 3)}
          onClick={() => void handleSaveDraft()}
        >
          {saving ? 'Saving…' : 'Save draft'}
        </button>
        {savedQuizId && <span className="mod-counts">Draft saved.</span>}
      </div>
      {saveError && <p className="error-banner">{saveError}</p>}

      <h2 className="mod-subheading">Latest quiz</h2>
      {latestError && <p className="error-banner">{latestError}</p>}
      {latestLoading ? (
        <p className="loading-state">Loading…</p>
      ) : latest === null ? (
        <p className="mod-blurb">No quiz has been created yet.</p>
      ) : (
        <div className="mod-entry">
          <div className="mod-entry-body">
            <div className="mod-entry-top">
              <span className="mod-entry-kind">
                Week of {latest.weekOf} &middot; {latest.published ? 'Published' : 'Draft'}
                {latest.published && latest.publishedAt && ` (${formatDateTime(latest.publishedAt)})`}
              </span>
            </div>
            <ul className="vote-breakdown">
              {latest.questions.map((lq) => (
                <li key={lq.id}>
                  {lq.correctMakerName}: {lq.correctCount}/{lq.answerCount} correct
                </li>
              ))}
            </ul>
            {publishError && <p className="mod-entry-error">{publishError}</p>}
            <div className="mod-entry-actions">
              <button type="button" className="btn btn-secondary" onClick={loadLatest} disabled={latestLoading}>
                Refresh
              </button>
              {!latest.published && (
                <button type="button" className="btn btn-primary" disabled={publishing || !canPublish} onClick={() => void handlePublish()}>
                  {publishing ? 'Publishing…' : 'Publish'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function pointInRect(pt: { x: number; y: number }, rect: QuizObscureRect): boolean {
  return pt.x >= rect.x && pt.x <= rect.x + rect.w && pt.y >= rect.y && pt.y <= rect.y + rect.h;
}

type DragState =
  | { mode: 'draw'; startX: number; startY: number }
  | { mode: 'move'; startX: number; startY: number; origin: QuizObscureRect };

/**
 * The obscure-box editor: drag on empty space to draw a new box (from that
 * point to wherever the pointer is now -- dragging further is how you
 * "resize" it, since a redraw simply replaces the box), drag inside an
 * existing box to move it without changing its size. Fractions are
 * computed against this element's OWN rendered box, which is sized to
 * exactly match the displayed photo (width:100%, height:auto -- see the
 * accompanying CSS): no separate contain-fit letterboxing math is needed
 * here because nothing crops or letterboxes the image in the first place.
 */
function RectEditor({
  photoId,
  rect,
  onChange,
}: {
  photoId: string;
  rect: QuizObscureRect | null;
  onChange: (rect: QuizObscureRect | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  function fractionFromEvent(e: React.MouseEvent): { x: number; y: number } | null {
    const el = containerRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    return { x: clamp01((e.clientX - box.left) / box.width), y: clamp01((e.clientY - box.top) / box.height) };
  }

  function handleMouseDown(e: React.MouseEvent) {
    const pt = fractionFromEvent(e);
    if (!pt) return;
    e.preventDefault();
    if (rect && pointInRect(pt, rect)) {
      setDrag({ mode: 'move', startX: pt.x, startY: pt.y, origin: rect });
    } else {
      setDrag({ mode: 'draw', startX: pt.x, startY: pt.y });
      onChange({ x: pt.x, y: pt.y, w: 0, h: 0 });
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!drag) return;
    const pt = fractionFromEvent(e);
    if (!pt) return;
    if (drag.mode === 'draw') {
      onChange({
        x: Math.min(drag.startX, pt.x),
        y: Math.min(drag.startY, pt.y),
        w: Math.abs(pt.x - drag.startX),
        h: Math.abs(pt.y - drag.startY),
      });
    } else {
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      onChange({
        x: clamp01(Math.min(drag.origin.x + dx, 1 - drag.origin.w)),
        y: clamp01(Math.min(drag.origin.y + dy, 1 - drag.origin.h)),
        w: drag.origin.w,
        h: drag.origin.h,
      });
    }
  }

  function endDrag() {
    setDrag(null);
  }

  return (
    <div
      ref={containerRef}
      className="quiz-rect-canvas"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <AuthImage
        photoId={photoId}
        basePath="/v1/admin/moderation/photos"
        variant="thumb"
        alt=""
        className="quiz-rect-image"
      />
      {rect && rect.w > 0 && rect.h > 0 && (
        <div
          className="quiz-rect-box"
          style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
        />
      )}
    </div>
  );
}

function QuestionCard({
  index,
  question,
  onRemove,
  onRectChange,
  onReroll,
}: {
  index: number;
  question: DraftQuestion;
  onRemove: () => void;
  onRectChange: (rect: QuizObscureRect | null) => void;
  onReroll: () => void;
}) {
  return (
    <div className="mod-entry">
      <div className="quiz-question-editor">
        <RectEditor photoId={question.photoId} rect={question.obscureRect} onChange={onRectChange} />
        {question.obscureRect && (
          <button type="button" className="btn-link" onClick={() => onRectChange(null)}>
            Clear box
          </button>
        )}
      </div>
      <div className="mod-entry-body">
        <div className="mod-entry-top">
          <span className="mod-entry-kind">
            Question {index + 1}: {question.makerName}
            {question.categoryName && ` (${question.categoryName})`}
          </span>
        </div>
        {question.distractorsLoading ? (
          <p className="loading-state">Loading distractors…</p>
        ) : question.distractorsError ? (
          <p className="mod-entry-error">{question.distractorsError}</p>
        ) : question.distractors.length < 3 ? (
          <p className="mod-entry-error">
            Only {question.distractors.length} other preset maker{question.distractors.length === 1 ? '' : 's'} in this
            category -- pick a different candidate, or add more preset makers to this category first.
          </p>
        ) : (
          <ul className="vote-breakdown">
            {question.distractors.map((d) => (
              <li key={d.makerId}>{d.makerName}</li>
            ))}
          </ul>
        )}
        <div className="mod-entry-actions">
          <button type="button" className="btn btn-secondary" onClick={onReroll} disabled={question.distractorsLoading}>
            Re-roll distractors
          </button>
          <button type="button" className="btn-link-danger" onClick={onRemove}>
            Remove question
          </button>
        </div>
      </div>
    </div>
  );
}
