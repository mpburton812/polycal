import React from 'react';

/**
 * Pipeline Tracker Canvas - Schedule Calendar Today Reset Refactor (PC-515)
 * Tracks status of development, testing, and promotion from Code -> Dev -> Test.
 */
export default function PipelineTrackerCanvas() {
  const taskInfo = {
    ticket: 'PC-515',
    title: 'Schedule Calendar Today Navigation & View Anchoring Refactor',
    status: 'PR Created (feature -> dev)',
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
      status: 'In Progress (PR Open)',
      details: [
        'Local quality gates (Vitest unit tests) passed',
        'Committed changes with PC-515 Jira key',
        'Pushed branch cursor/pc-515-calendar-today-refactor-e698',
        'Created Pull Request #480 targeting dev',
      ],
    },
    {
      id: 'test',
      name: '3. Move to Test (dev -> test)',
      status: 'Pending PR Merge',
      details: [
        'Awaiting merge of PR #480 into dev',
        'Promotion PR to test tier to be created upon dev integration',
        'Verify test environment deployment at test.polycal.net',
      ],
    },
  ];

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        {pipelineStages.map((stage) => (
          <div key={stage.id} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
            <h2 style={{ fontSize: '16px', margin: '0 0 12px 0', color: '#1e293b' }}>{stage.name}</h2>
            <div style={{
              display: 'inline-block',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              marginBottom: '12px',
              backgroundColor: stage.status === 'In Progress (PR Open)' ? '#dbeafe' : stage.status === 'Completed' ? '#dcfce7' : '#f1f5f9',
              color: stage.status === 'In Progress (PR Open)' ? '#1e40af' : stage.status === 'Completed' ? '#166534' : '#64748b'
            }}>
              {stage.status}
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#334155', fontSize: '13px' }}>
              {stage.details.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '6px' }}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
