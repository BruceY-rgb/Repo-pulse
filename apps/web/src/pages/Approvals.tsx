import { useState } from 'react';
import {
  GitPullRequest,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Search,
  Filter,
  MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useApprovals, useApproveApproval, useRejectApproval, useEditAndApproveApproval } from '@/hooks/use-approvals';
import type { ApprovalStatus } from '@/services/approval.service';

export function Approvals() {
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedApproval, setSelectedApproval] = useState<{
    id: string;
    originalContent?: string;
  } | null>(null);
  const [comment, setComment] = useState('');
  const [editedContent, setEditedContent] = useState('');

  // Map tab to status
  const statusMap = {
    pending: 'PENDING' as const,
    approved: 'APPROVED' as const,
    rejected: 'REJECTED' as const,
  };

  // React Query Hooks
  const { data: approvalsData, isLoading: loading } = useApprovals({
    status: activeTab !== 'all' ? statusMap[activeTab as keyof typeof statusMap] : undefined,
  });

  const approvals = approvalsData?.approvals ?? [];

  // Mutations
  const approveMutation = useApproveApproval();
  const rejectMutation = useRejectApproval();
  const editAndApproveMutation = useEditAndApproveApproval();

  const handleApprove = async () => {
    if (!selectedApproval) return;
    try {
      await approveMutation.mutateAsync({ approvalId: selectedApproval.id, comment });
      setSelectedApproval(null);
      setComment('');
    } catch (error) {
      console.error('Failed to approve:', error);
    }
  };

  const handleReject = async () => {
    if (!selectedApproval) return;
    try {
      await rejectMutation.mutateAsync({ approvalId: selectedApproval.id, comment });
      setSelectedApproval(null);
      setComment('');
    } catch (error) {
      console.error('Failed to reject:', error);
    }
  };

  const handleEditAndApprove = async () => {
    if (!selectedApproval || !editedContent) return;
    try {
      await editAndApproveMutation.mutateAsync({
        approvalId: selectedApproval.id,
        editedContent,
        comment,
      });
      setSelectedApproval(null);
      setComment('');
      setEditedContent('');
    } catch (error) {
      console.error('Failed to edit and approve:', error);
    }
  };

  const getStatusBadge = (status: ApprovalStatus) => {
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
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Approvals</h1>
          <p className="text-sm text-[var(--github-text-secondary)] mt-1">
            Review and approve high-risk code changes
          </p>
        </div>
      </div>

      <Tabs defaultValue="pending" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="bg-[var(--github-surface)] border border-[var(--github-border)]">
          <TabsTrigger
            value="pending"
            className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
          >
            <Clock className="w-4 h-4 mr-2" />
            Pending
            <Badge className="ml-2 bg-[var(--github-accent)] text-white">
              {approvals.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="approved"
            className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Approved
          </TabsTrigger>
          <TabsTrigger
            value="rejected"
            className="data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Rejected
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--github-accent)]" />
            </div>
          ) : approvals.length === 0 ? (
            <div className="text-center py-16">
              <GitPullRequest className="w-16 h-16 mx-auto mb-4 text-[var(--github-text-secondary)]" />
              <h3 className="text-lg font-medium text-white mb-2">No approvals</h3>
              <p className="text-sm text-[var(--github-text-secondary)]">
                {activeTab === 'pending' ? 'No pending approvals' : `No ${activeTab} approvals`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Approval List */}
              <div className="space-y-3">
                {approvals.map((approval) => (
                  <Card
                    key={approval.id}
                    className={`card-github cursor-pointer hover:border-[var(--github-accent)]/50 transition-all ${
                      selectedApproval?.id === approval.id ? 'border-[var(--github-accent)]' : ''
                    }`}
                    onClick={() => {
                      setSelectedApproval(approval);
                      setEditedContent(approval.originalContent || '');
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-400" />
                          <span className="text-sm font-medium text-white">
                            {approval.event?.title || 'Code Change'}
                          </span>
                        </div>
                        {getStatusBadge(approval.status)}
                      </div>
                      <div className="text-xs text-[var(--github-text-secondary)] mb-2">
                        {approval.event?.repository?.name || 'Unknown Repository'}
                      </div>
                      <div className="text-xs text-[var(--github-text-secondary)]">
                        {new Date(approval.createdAt).toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Approval Detail */}
              {selectedApproval && (
                <Card className="card-github sticky top-4">
                  <CardHeader>
                    <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                      <GitPullRequest className="w-5 h-5" />
                      Approval Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-white mb-1">Event</h4>
                      <p className="text-sm text-[var(--github-text-secondary)]">
                        {selectedApproval.event?.title || 'Unknown'}
                      </p>
                      <p className="text-xs text-[var(--github-text-secondary)]">
                        {selectedApproval.event?.repository?.name}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-white mb-1">AI Analysis Summary</h4>
                      <div className="p-3 rounded-lg bg-white/5 text-sm text-[var(--github-text)] max-h-40 overflow-y-auto">
                        {selectedApproval.editedContent || selectedApproval.originalContent || 'No analysis available'}
                      </div>
                    </div>

                    {selectedApproval.status === 'PENDING' && (
                      <>
                        <div>
                          <h4 className="text-sm font-medium text-white mb-1">Edit Content (Optional)</h4>
                          <Textarea
                            value={editedContent}
                            onChange={(e) => setEditedContent(e.target.value)}
                            placeholder="Edit the content before approving..."
                            className="bg-[var(--github-surface)] border-[var(--github-border)] min-h-[100px]"
                          />
                        </div>

                        <div>
                          <h4 className="text-sm font-medium text-white mb-1">Comment (Optional)</h4>
                          <Textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Add a comment..."
                            className="bg-[var(--github-surface)] border-[var(--github-border)]"
                          />
                        </div>

                        <div className="flex gap-3">
                          <Button
                            onClick={handleApprove}
                            disabled={approveMutation.isPending}
                            className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
                          >
                            {approveMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                            Approve
                          </Button>
                          <Button
                            onClick={handleReject}
                            disabled={rejectMutation.isPending}
                            variant="outline"
                            className="flex-1 gap-2 border-red-400 text-red-400 hover:bg-red-400/10"
                          >
                            {rejectMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                            Reject
                          </Button>
                        </div>

                        {editedContent && editedContent !== selectedApproval.originalContent && (
                          <Button
                            onClick={handleEditAndApprove}
                            disabled={editAndApproveMutation.isPending || !editedContent}
                            variant="outline"
                            className="w-full gap-2"
                          >
                            {approveMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <MessageSquare className="w-4 h-4" />
                            )}
                            Edit & Approve
                          </Button>
                        )}
                      </>
                    )}

                    {selectedApproval.status !== 'PENDING' && selectedApproval.comment && (
                      <div>
                        <h4 className="text-sm font-medium text-white mb-1">Review Comment</h4>
                        <p className="text-sm text-[var(--github-text-secondary)] p-3 rounded-lg bg-white/5">
                          {selectedApproval.comment}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}