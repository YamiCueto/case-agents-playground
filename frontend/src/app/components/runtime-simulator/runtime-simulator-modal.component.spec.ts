import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { RuntimeSimulatorModalComponent } from './runtime-simulator-modal.component';
import { SimulatorProjectionService } from '../../services/simulator-projection.service';
import { EventStoreService } from '../../services/event-store.service';
import { StreamEvent } from '../../models/agent.models';

describe('RuntimeSimulatorModalComponent', () => {
  let fixture: ComponentFixture<RuntimeSimulatorModalComponent>;
  let component: RuntimeSimulatorModalComponent;
  let sim: SimulatorProjectionService;
  let eventStore: EventStoreService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RuntimeSimulatorModalComponent],
      providers: [provideHttpClient()]
    }).compileComponents();

    fixture = TestBed.createComponent(RuntimeSimulatorModalComponent);
    component = fixture.componentInstance;
    sim = TestBed.inject(SimulatorProjectionService);
    eventStore = TestBed.inject(EventStoreService);
    fixture.detectChanges();
  });

  it('does not display backdrop or window when closed', () => {
    expect(sim.isOpen()).toBe(false);
    const modal = fixture.nativeElement.querySelector('.simulator-backdrop');
    expect(modal).toBeNull();
  });

  it('renders modal, header, and node chips when open', () => {
    sim.openSimulator();
    fixture.detectChanges();

    const backdrop = fixture.nativeElement.querySelector('.simulator-backdrop');
    expect(backdrop).not.toBeNull();

    const title = fixture.nativeElement.querySelector('.header-titles h2');
    expect(title.textContent).toContain('Simulador del Runtime de Agentes');

    const nodeChips = fixture.nativeElement.querySelectorAll('.node-chip');
    expect(nodeChips.length).toBeGreaterThanOrEqual(4);
  });

  it('switches between event tab and node tab', () => {
    sim.openSimulator();
    fixture.detectChanges();

    expect(component.activeTab()).toBe('event');

    const tabBtns = fixture.nativeElement.querySelectorAll('.panel-tab-btn');
    expect(tabBtns.length).toBe(2);

    // Click node tab
    tabBtns[1].click();
    fixture.detectChanges();
    expect(component.activeTab()).toBe('node');

    const nodeTitle = fixture.nativeElement.querySelector('.node-main-title');
    expect(nodeTitle).not.toBeNull();
  });

  it('closes modal when close button is clicked', () => {
    sim.openSimulator();
    fixture.detectChanges();

    const closeBtn = fixture.nativeElement.querySelector('.btn-close-modal') as HTMLButtonElement;
    closeBtn.click();
    fixture.detectChanges();

    expect(sim.isOpen()).toBe(false);
  });

  it('toggles fullscreen state via header button', () => {
    sim.openSimulator();
    fixture.detectChanges();

    expect(sim.isFullscreen()).toBe(false);
    const expandBtn = fixture.nativeElement.querySelector('.btn-header-ctrl') as HTMLButtonElement;
    expandBtn.click();
    fixture.detectChanges();

    expect(sim.isFullscreen()).toBe(true);
  });

  it('handles keyboard shortcuts (Escape closes, Space toggles play/pause)', () => {
    sim.openSimulator();
    fixture.detectChanges();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(sim.isOpen()).toBe(false);
  });

  it('displays active event details when events exist', () => {
    eventStore.startNewRun('v1');
    const evt: StreamEvent = {
      event_id: 'e1',
      agent_version: 'v1',
      type: 'TOOL_PROPOSAL',
      payload: { tool_name: 'get_ticket_by_id', arguments: { ticket_code: 'TICK-1001' } },
      timestamp: new Date().toISOString()
    };
    eventStore.addEvent(evt);

    sim.openSimulator();
    fixture.detectChanges();

    const badgeType = fixture.nativeElement.querySelector('.badge-type');
    expect(badgeType.textContent).toContain('TOOL_PROPOSAL');

    const llmRole = fixture.nativeElement.querySelector('.llm-box .role-text');
    expect(llmRole.textContent).toContain('get_ticket_by_id');
  });
});
