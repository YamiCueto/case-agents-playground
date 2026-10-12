import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WalkthroughOverlayComponent } from './walkthrough-overlay.component';
import { WalkthroughService } from '../../services/walkthrough.service';

describe('WalkthroughOverlayComponent', () => {
  let fixture: ComponentFixture<WalkthroughOverlayComponent>;
  let component: WalkthroughOverlayComponent;
  let service: WalkthroughService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [WalkthroughOverlayComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(WalkthroughOverlayComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(WalkthroughService);
    fixture.detectChanges();
  });

  it('does not render overlay when inactive', () => {
    expect(service.isActive()).toBe(false);
    const overlay = fixture.nativeElement.querySelector('.walkthrough-container');
    expect(overlay).toBeNull();
  });

  it('renders spotlight overlay and card when active', () => {
    service.startTour('v1');
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.walkthrough-container');
    expect(overlay).not.toBeNull();

    const card = fixture.nativeElement.querySelector('.walkthrough-card');
    expect(card).not.toBeNull();

    const title = fixture.nativeElement.querySelector('.step-title');
    expect(title.textContent).toContain('Bienvenido');
  });

  it('navigates to next step on next button click', () => {
    service.startTour('v1');
    fixture.detectChanges();

    const nextBtn = fixture.nativeElement.querySelector('.btn-tour-primary') as HTMLButtonElement;
    expect(nextBtn).not.toBeNull();
    nextBtn.click();
    fixture.detectChanges();

    expect(service.currentStepIndex()).toBe(1);
  });

  it('closes tour when skip button or close icon is clicked', () => {
    service.startTour('v1');
    fixture.detectChanges();

    const closeBtn = fixture.nativeElement.querySelector('.btn-close-tour') as HTMLButtonElement;
    closeBtn.click();
    fixture.detectChanges();

    expect(service.isActive()).toBe(false);
  });

  it('handles keyboard navigation (Escape, ArrowRight, ArrowLeft)', () => {
    service.startTour('v1');
    fixture.detectChanges();

    // ArrowRight
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();
    expect(service.currentStepIndex()).toBe(1);

    // ArrowLeft
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    fixture.detectChanges();
    expect(service.currentStepIndex()).toBe(0);

    // Escape
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(service.isActive()).toBe(false);
  });
});
