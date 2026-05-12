import { useState, useEffect, useCallback } from 'react';
import {
  GitPullRequest,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { approvalService, type Approval, type ApprovalStatus } from '@/services/approval.service';
import { EventContextChips } from '@/components/shared/EventContextChips';

function getStatusBadge(status: ApprovalStatus) {
  switch (status) {
    case 'PENDING':
      return <Badge className="bg-yellow-400/20 text-yellow-400"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    case 'APPROVED':
      return <Badge className="bg-green-400/20 text-green-400"><CheckCircle className="w-3 h-3 mr-1" /> Approved</Badge>;
    case 'REJECTED':
      return <Badge className="bg-red-400/20 text-red-400"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
    case 'EDITED':
      return <Badge className="bg-blue-400/20 text-blue-400"><MessageSquare className="w-3 h-3 mr-1" /> Edited</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function ListPanel({ status, selectedId, onSelect, onDelete }: { status: ApprovalStatus; selectedId?: string; onSelect: (a: Approval) => void; onDelete?: (id: string) => void }) {
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(function () {
    setLoading(true);
    approvalService.getApprovals({ status })
      .then(function (r) { setItems(r?.approvals ?? []); })
      .catch(function () { setItems([]); })
      .finally(function () { setLoading(false); });
  }, [status]);

  useEffect(function () { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner className="h-8 w-8 text-[var(--github-accent)]" /></div>;
  if (items.length === 0) return <div className="text-center py-16"><GitPullRequest className="w-16 h-16 mx-auto mb-4 text-[var(--github-text-secondary)]" /><h3 className="text-lg font-medium text-white mb-2">No {status.toLowerCase()} approvals</h3></div>;

  return (
    <div className="space-y-3">
      {items.map(function (a) {
        return (
          <Card
            key={a.id}
            className={'card-github cursor-pointer hover:border-[var(--github-accent)]/50 transition-all group ' + (selectedId === a.id ? 'border-[var(--github-accent)]' : '')}
            onClick={function () { onSelect(a); }}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-medium text-white">{a.event?.title || 'Code Change'}</span>
                </div>
                <div className="flex items-center gap-1">
                  {getStatusBadge(a.status)}
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                      onClick={function (e) { e.stopPropagation(); onDelete(a.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <EventContextChips event={a.event} className="mb-2" />
              <div className="text-xs text-[var(--github-text-secondary)] mb-2">{a.event?.repository?.name || 'Unknown Repository'}</div>
              <div className="text-xs text-[var(--github-text-secondary)]">{new Date(a.createdAt).toLocaleString()}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function Approvals() {
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  function triggerRefresh() { setRefreshKey(function (k) { return k + 1; }); window.dispatchEvent(new Event('approval-updated')); }

  useEffect(function () {
    approvalService.getPendingCount().then(function (r) { setPendingCount(r?.count ?? 0); }).catch(function () {});
  }, [refreshKey]);

  function handleSelect(a: Approval) {
    setSelectedApproval(a);
    setEditedContent(a.originalContent || '');
    setComment('');
  }

  async function handleApprove() {
    if (!selectedApproval) return;
    setActionLoading(true);
    try {
      await approvalService.approve(selectedApproval.id, comment);
      setSelectedApproval(null); setComment('');
      triggerRefresh();
    } catch (e) { console.error(e); }
    finally { setActionLoading(false); }
  }

  async function handleReject() {
    if (!selectedApproval) return;
    setActionLoading(true);
    try {
      await approvalService.reject(selectedApproval.id, comment);
      setSelectedApproval(null); setComment('');
      triggerRefresh();
    } catch (e) { console.error(e); }
    finally { setActionLoading(false); }
  }

  async function handleEditAndApprove() {
    if (!selectedApproval || !editedContent) return;
    setActionLoading(true);
    try {
      await approvalService.editAndApprove(selectedApproval.id, editedContent, comment);
      setSelectedApproval(null); setComment(''); setEditedContent('');
      triggerRefresh();
    } catch (e) { console.error(e); }
    finally { setActionLoading(false); }
  }

  async function handleDelete(id: string) {
    try {
      await approvalService.deleteApproval(id);
      if (selectedApproval?.id === id) setSelectedApproval(null);
      triggerRefresh();
    } catch (e) { console.error(e); }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Approvals</h1>
          <p className="text-sm text-[var(--github-text-secondary)] mt-1">Review and approve high-risk code changes</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-[var(--github-surface)] border border-[var(--github-border)]">
          <TabsTrigger value="pending" className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"><Clock className="w-4 h-4 mr-2" />Pending {pendingCount > 0 && (<Badge className="ml-1 bg-[var(--github-accent)] text-white text-xs">{pendingCount}</Badge>)}</TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"><CheckCircle className="w-4 h-4 mr-2" />Approved</TabsTrigger>
          <TabsTrigger value="rejected" className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"><XCircle className="w-4 h-4 mr-2" />Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ListPanel key={'pending-' + refreshKey} status="PENDING" selectedId={selectedApproval?.id} onSelect={handleSelect} onDelete={handleDelete} />
            {selectedApproval && selectedApproval.status === 'PENDING' && <DetailPanel approval={selectedApproval} actionLoading={actionLoading} comment={comment} setComment={setComment} editedContent={editedContent} setEditedContent={setEditedContent} onApprove={handleApprove} onReject={handleReject} onEditAndApprove={handleEditAndApprove} />}
          </div>
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ListPanel key={'approved-' + refreshKey} status="APPROVED" selectedId={selectedApproval?.id} onSelect={handleSelect} onDelete={handleDelete} />
            {selectedApproval && selectedApproval.status !== 'PENDING' && <DetailPanel approval={selectedApproval} readonly />}
          </div>
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ListPanel key={'rejected-' + refreshKey} status="REJECTED" selectedId={selectedApproval?.id} onSelect={handleSelect} onDelete={handleDelete} />
            {selectedApproval && selectedApproval.status !== 'PENDING' && <DetailPanel approval={selectedApproval} readonly />}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DetailPanel({ approval, actionLoading, comment, setComment, editedContent, setEditedContent, onApprove, onReject, onEditAndApprove, readonly }: {
  approval: Approval;
  actionLoading?: boolean;
  comment?: string;
  setComment?: (v: string) => void;
  editedContent?: string;
  setEditedContent?: (v: string) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onEditAndApprove?: () => void;
  readonly?: boolean;
}) {
  return (
    <Card className="card-github sticky top-4">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-white flex items-center gap-2"><GitPullRequest className="w-5 h-5" />Approval Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-white mb-1">Event</h4>
          <p className="text-sm text-[var(--github-text-secondary)]">{approval.event?.title || 'Unknown'}</p>
          <EventContextChips event={approval.event} className="mt-2" />
          <p className="text-xs text-[var(--github-text-secondary)]">{approval.event?.repository?.name}</p>
        </div>
        <div>
          <h4 className="text-sm font-medium text-white mb-1">AI Analysis Summary</h4>
          <div className="p-3 rounded-lg bg-white/5 text-sm text-[var(--github-text)] max-h-40 overflow-y-auto">
            {approval.editedContent || approval.originalContent || 'No analysis available'}
          </div>
        </div>

        {!readonly && (
          <>
            <div>
              <h4 className="text-sm font-medium text-white mb-1">Edit Content (Optional)</h4>
              <Textarea value={editedContent || ''} onChange={function (e) { if (setEditedContent) setEditedContent(e.target.value); }} placeholder="Edit the content before approving..." className="bg-[var(--github-surface)] border-[var(--github-border)] min-h-[100px]" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-white mb-1">Comment (Optional)</h4>
              <Textarea value={comment || ''} onChange={function (e) { if (setComment) setComment(e.target.value); }} placeholder="Add a comment..." className="bg-[var(--github-surface)] border-[var(--github-border)]" />
            </div>
            <div className="flex gap-3">
              <Button onClick={onApprove} disabled={actionLoading} className="flex-1 gap-2 bg-green-600 hover:bg-green-700">{actionLoading ? <Spinner className="h-4 w-4" /> : <CheckCircle className="w-4 h-4" />}Approve</Button>
              <Button onClick={onReject} disabled={actionLoading} variant="outline" className="flex-1 gap-2 border-red-400 text-red-400 hover:bg-red-400/10">{actionLoading ? <Spinner className="h-4 w-4" /> : <XCircle className="w-4 h-4" />}Reject</Button>
            </div>
            {editedContent && editedContent !== approval.originalContent && (
              <Button onClick={onEditAndApprove} disabled={actionLoading || !editedContent} variant="outline" className="w-full gap-2">{actionLoading ? <Spinner className="h-4 w-4" /> : <MessageSquare className="w-4 h-4" />}Edit & Approve</Button>
            )}
          </>
        )}

        {readonly && approval.comment && (
          <div>
            <h4 className="text-sm font-medium text-white mb-1">Review Comment</h4>
            <p className="text-sm text-[var(--github-text-secondary)] p-3 rounded-lg bg-white/5">{approval.comment}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
