import { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import architectureGraph from './states-architecture.json';
import { Link } from '../router.jsx';

const LANE_X = {
  client: 40,
  runtime: 420,
  transport: 800,
  server: 1180,
};

const TAG_CLASS_BY_KIND = {
  client: 'states-flow-node-client',
  state: 'states-flow-node-state',
  runtime: 'states-flow-node-runtime',
  transport: 'states-flow-node-transport',
  server: 'states-flow-node-server',
  jobs: 'states-flow-node-jobs',
};

function ArchitectureNode({ data }) {
  const kind = String(data.tag || 'default');
  return (
    <div className={`states-flow-node ${TAG_CLASS_BY_KIND[kind] || ''}`}>
      <Handle type="target" position={Position.Left} className="states-flow-handle" />
      <div className="states-flow-node-tag">{kind}</div>
      <h3>{data.title}</h3>
      <p>{data.summary}</p>
      <ul className="states-flow-node-points">
        {(Array.isArray(data.points) ? data.points : []).map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <Handle type="source" position={Position.Right} className="states-flow-handle" />
    </div>
  );
}

const nodeTypes = {
  architectureNode: ArchitectureNode,
};

function buildFlowModel(graph) {
  const laneIndexById = {};
  (Array.isArray(graph.lanes) ? graph.lanes : []).forEach((lane, index) => {
    laneIndexById[lane.id] = index;
  });

  const laneRowCount = {};
  const nodes = (Array.isArray(graph.nodes) ? graph.nodes : []).map((node) => {
    const laneId = String(node.laneId || '');
    const rowIndex = Number(laneRowCount[laneId] || 0);
    laneRowCount[laneId] = rowIndex + 1;
    const laneIndex = Number(laneIndexById[laneId] || 0);
    return {
      id: node.id,
      type: 'architectureNode',
      position: {
        x: Number(LANE_X[laneId] || laneIndex * 380),
        y: 120 + rowIndex * 240,
      },
      data: node,
      draggable: false,
      selectable: false,
    };
  });

  const edges = (Array.isArray(graph.edges) ? graph.edges : []).map((edge, index) => ({
    id: `edge-${index}-${edge.from}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    type: 'smoothstep',
    animated: true,
    selectable: false,
    label: edge.label,
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 999,
    labelStyle: {
      fill: '#355e9a',
      fontSize: 11,
      fontWeight: 800,
    },
    labelBgStyle: {
      fill: 'rgba(255,255,255,0.88)',
      fillOpacity: 1,
    },
    style: {
      stroke: 'rgba(50, 113, 233, 0.48)',
      strokeWidth: 2,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: 'rgba(50, 113, 233, 0.7)',
    },
  }));

  return { nodes, edges };
}

function StateMachineSection({ title, items }) {
  return (
    <article className="home-card states-machine-card">
      <div className="home-section-head">
        <h2>{title}</h2>
      </div>
      <div className="states-machine-list">
        {items.map((item, index) => (
          <div className="states-machine-item" key={`${item.name}-${index}`}>
            <div className="states-machine-step">{index + 1}</div>
            <div>
              <strong>{item.name}</strong>
              <p>{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function StatesPage() {
  const graph = architectureGraph;
  const flowModel = useMemo(() => buildFlowModel(graph), [graph]);

  useEffect(() => {
    document.body.classList.add('route-home');
    document.body.classList.remove('route-sheet');
    return () => {
      document.body.classList.remove('route-home');
    };
  }, []);

  return (
    <main className="home-page settings-page states-page">
      <section className="home-hero settings-hero states-hero">
        <div className="home-hero-copy">
          <div className="home-brand">
            <img className="home-brand-logo" src="/logo.png" alt="States" />
          </div>
          <h1>System states</h1>
          <p className="home-subtitle">
            {graph.summary} The diagram is rendered from a dedicated JSON model so the
            architecture view and the data source stay aligned.
          </p>
          <div className="home-actions">
            <Link className="home-secondary-link" to="/">
              Home
            </Link>
            <Link className="home-secondary-link" to="/stats">
              Stats
            </Link>
            <Link className="home-secondary-link" to="/settings?tab=jobs">
              Jobs settings
            </Link>
          </div>
        </div>
      </section>

      <section className="home-card states-card">
        <div className="home-section-head">
          <h2>Architecture flow</h2>
        </div>
        <p className="states-section-note">
          Узлы показывают ключевые понятия системы, а связи отражают основные
          переходы данных и состояний между клиентом, runtime, WebSocket-слоем и сервером.
        </p>
        <div className="states-lane-summary">
          {graph.lanes.map((lane) => (
            <article className="states-lane-summary-item" key={lane.id}>
              <span className="states-lane-kicker">{lane.label}</span>
              <p>{lane.description}</p>
            </article>
          ))}
        </div>
        <div className="states-reactflow-shell">
          <ReactFlow
            nodes={flowModel.nodes}
            edges={flowModel.edges}
            nodeTypes={nodeTypes}
            fitView={true}
            fitViewOptions={{ padding: 0.12, maxZoom: 1.05 }}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            nodesDraggable={false}
            elementsSelectable={false}
            zoomOnScroll={true}
            panOnDrag={true}
            minZoom={0.45}
            maxZoom={1.2}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
            }}
          >
            <Background gap={20} size={1} color="rgba(76, 99, 88, 0.12)" />
            <MiniMap
              pannable={true}
              zoomable={true}
              className="states-reactflow-minimap"
              nodeColor={(node) => {
                if (node.type !== 'architectureNode') return '#c7d5cf';
                const tag = String((node.data && node.data.tag) || '');
                if (tag === 'client') return '#5c9f7b';
                if (tag === 'runtime' || tag === 'state') return '#5f8fe0';
                if (tag === 'transport') return '#c58a35';
                return '#b76d63';
              }}
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </section>

      <section className="home-card states-card">
        <div className="home-section-head">
          <h2>Dependency tree</h2>
        </div>
        <div className="states-tree">
          {graph.dependencyTree.map((item) => (
            <article className="states-tree-card" key={item.level}>
              <div className="states-tree-level">{item.level}</div>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="states-machines">
        {graph.stateMachines.map((machine) => (
          <StateMachineSection key={machine.id} title={machine.title} items={machine.items} />
        ))}
      </section>
    </main>
  );
}
