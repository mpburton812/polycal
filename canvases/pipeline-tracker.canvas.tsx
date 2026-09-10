import React from 'react';

/**
 * Pipeline Tracker Canvas - Schedule Calendar Today Reset Refactor (PC-515)
 * Tracks status of development, testing, and promotion from Code -> Dev -> Test -> Production.
 */
export default function PipelineTrackerCanvas() {
  const taskInfo = {
    ticket: 'PC-515',
    title: 'Schedule Calendar Today Navigation & View Anchoring Refactor',
    status: 'PR #480 reopened — promoting toward production',
    prUrl: 'https://github.com/mpburton812/polycal/pull/480',
  };

  const pipelineStages = [
    {
      id: 'code',
      name: '1. Code Refactor',
      status: 'Completed',
      details: [
        'Stripped bi-directional infinite scroll & segment stacking in ScheduleClient.tsx',
        'Implemented clean single-window date anchor state',
        'Implemented deterministic Goto Today scroll reset across Day, Week, and Month views',
        'Unit tests (Vitest) & E2E tests (Playwright) passing',
      ],
    },
    {
      id: 'dev',
      name: '2. Move to Dev (feature -> dev)',
      status: 'CI re-running',
      details: [
        'PR #480 reopened and targeting dev',
        'Audit/unit/build already green; Playwright shards queued on head 19f808f',
        'Merge into dev required next (protected branch)',
      ],
    },
    {
      id: 'test',
      name: '3. Move to Test (dev -> test)',
      status: 'Pending',
      details: [
        'Open promotion PR after #480 merges to dev',
        'Verify test.polycal.net after merge',
      ],
    },
    {
      id: 'production',
      name: '4. Move to Production (test -> production)',
      status: 'Pending',
      details: [
        'Mandatory user-journey suite before opening/merging production PR',
        'Open test → production PR after journeys pass',
      ],
    },
  ];

  const statusStyle = (status: string) => {
    if (status === 'Completed') return { backgroundColor: '#dcfce7', color: '#166534' };
    if (status === 'CI re-running' || status === 'Ready to merge') {
      return { backgroundColor: '#dbeafe', color: '#1e40af' };
    }
    return { backgroundColor: '#f1f5f9', color: '#64748b' };
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h1 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>{taskInfo.ticket}: {taskInfo.title}</h1>
        <p style={{ margin: '8px 0 0 0', color: '#475569', fontSize: '14px' }}>
          <strong>Pipeline Status:</strong> <span style={{ color: '#2563eb', fontWeight: 'bold' }}>{taskInfo.status}</span>
        </p>
        <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
          <strong>Pull Request:</strong> <a href={taskInfo.prUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{taskInfo.prUrl}</a>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {pipelineStages.map((stage) => {
          const badge = statusStyle(stage.status);
          return (
          <div key={stage.id} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
            <h2 style={{ fontSize: '16px', margin: '0 0 12px 0', color: '#1e293b' }}>{stage.name}</h2>
            <div style={{
              display: 'inline-block',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              marginBottom: '12px',
              backgroundColor: badge.backgroundColor,
              color: badge.color,
            }}>
              {stage.status}
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#334155', fontSize: '13px' }}>
              {stage.details.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '6px' }}>{item}</li>
              ))}
            </ul>
          </div>
          );
        })}
      </div>
    </div>
  );
}
