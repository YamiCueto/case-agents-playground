import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgentJourneyStep } from '../../../models/journey.models';

@Component({
  selector: 'app-journey-flow',
  standalone: true,
  imports: [CommonModule],
  template: `
    <nav class="flow-track-container" aria-label="Ruta de ejecución agéntica">
      <div class="flow-track">
        @for (step of steps(); track step.id; let idx = $index; let isLast = $last) {
          <div
            class="flow-node"
            [class.active]="selectedHopNumber() === step.hopNumber"
            [class.completed]="step.status === 'completed'"
            [class.running]="step.status === 'active'"
            [class.skipped]="step.status === 'skipped'"
            [class.failed]="step.status === 'failed'"
            [class.idle]="step.status === 'idle'"
            tabindex="0"
            role="button"
            [attr.aria-label]="'Paso ' + step.hopNumber + ': ' + step.shortName + ' (' + step.status + ')'"
            (click)="stepClick.emit(idx)"
            (keydown.enter)="stepClick.emit(idx)"
            (keydown.space)="stepClick.emit(idx)"
          >
            <div class="node-circle">
              <span class="node-num">{{ step.hopNumber }}</span>
              @if (step.status === 'completed') {
                <span class="status-icon completed">&#x2713;</span>
              } @else if (step.status === 'skipped') {
                <span class="status-icon skipped">&#x2298;</span>
              } @else if (step.status === 'failed') {
                <span class="status-icon failed">&#x2715;</span>
              } @else if (step.status === 'active') {
                <span class="status-icon active">&#x25C9;</span>
              }
            </div>

            <span class="node-label">{{ step.shortName }}</span>
          </div>

          @if (!isLast) {
            <div
              class="flow-connector"
              [class.completed]="step.status === 'completed' && steps()[idx + 1]?.status !== 'idle'"
              [class.skipped]="step.status === 'skipped' || steps()[idx + 1]?.status === 'skipped'"
            >
              <div class="connector-line"></div>
              @if (step.status === 'active') {
                <div class="pulse-packet"></div>
              }
            </div>
          }
        }
      </div>
    </nav>
  `,
  styles: [`
    .flow-track-container {
      width: 100%;
      overflow-x: auto;
      padding: 0.6rem 0.25rem;
      scrollbar-width: thin;
      scrollbar-color: #334155 transparent;
      -webkit-overflow-scrolling: touch;
    }
    .flow-track {
      display: flex;
      align-items: center;
      min-width: max-content;
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
    }
    .flow-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      cursor: pointer;
      padding: 0.35rem 0.5rem;
      border-radius: 8px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
      user-select: none;
    }
    .flow-node:hover {
      background: rgba(30, 41, 59, 0.7);
    }
    .flow-node:focus-visible {
      box-shadow: 0 0 0 2px #38bdf8;
    }
    .node-circle {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #0f172a;
      border: 2px solid #475569;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      font-size: 0.76rem;
      font-weight: 700;
      color: #94a3b8;
      transition: all 0.25s ease;
    }
    .flow-node.active .node-circle {
      border-color: #38bdf8;
      background: #0284c7;
      color: #ffffff;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.6);
      transform: scale(1.12);
    }
    .flow-node.completed .node-circle {
      border-color: #10b981;
      background: #064e3b;
      color: #34d399;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.3);
    }
    .flow-node.running .node-circle {
      border-color: #38bdf8;
      background: #0369a1;
      color: #ffffff;
      animation: pulseNode 1.2s infinite alternate;
    }
    .flow-node.skipped .node-circle {
      border-color: #475569;
      border-style: dashed;
      background: #1e293b;
      color: #64748b;
      opacity: 0.6;
    }
    .flow-node.failed .node-circle {
      border-color: #ef4444;
      background: #7f1d1d;
      color: #fca5a5;
    }
    @keyframes pulseNode {
      from { box-shadow: 0 0 4px #38bdf8; }
      to { box-shadow: 0 0 14px #38bdf8; }
    }
    .status-icon {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      font-size: 0.55rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
    }
    .status-icon.completed { background: #10b981; color: #022c22; }
    .status-icon.active { background: #38bdf8; color: #082f49; }
    .status-icon.skipped { background: #64748b; color: #0f172a; }
    .status-icon.failed { background: #ef4444; color: #ffffff; }

    .node-label {
      font-size: 0.68rem;
      font-weight: 600;
      color: #94a3b8;
      white-space: nowrap;
      transition: color 0.2s ease;
    }
    .flow-node.active .node-label {
      color: #38bdf8;
      font-weight: 700;
    }
    .flow-node.completed .node-label {
      color: #e2e8f0;
    }
    .flow-node.skipped .node-label {
      color: #64748b;
    }

    .flow-connector {
      width: 22px;
      height: 2px;
      position: relative;
      margin-top: -14px;
    }
    .connector-line {
      width: 100%;
      height: 100%;
      background: #334155;
      transition: background 0.3s ease;
    }
    .flow-connector.completed .connector-line {
      background: #10b981;
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
    }
    .flow-connector.skipped .connector-line {
      background: #475569;
      border-top: 1px dashed #64748b;
    }
    .pulse-packet {
      position: absolute;
      top: -3px;
      left: 0;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #38bdf8;
      box-shadow: 0 0 8px #38bdf8;
      animation: pulsePacket 1s linear infinite;
    }
    @keyframes pulsePacket {
      0% { left: 0%; opacity: 0; }
      50% { opacity: 1; }
      100% { left: 100%; opacity: 0; }
    }
  `]
})
export class JourneyFlowComponent {
  readonly steps = input<AgentJourneyStep[]>([]);
  readonly selectedHopNumber = input<number>(1);
  readonly stepClick = output<number>();
}
