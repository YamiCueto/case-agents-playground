import { TestBed } from '@angular/core/testing';
import { DemoModeService } from './demo-mode.service';

describe('DemoModeService', () => {
  let service: DemoModeService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(DemoModeService);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should toggle demo mode correctly', () => {
    const initial = service.isDemoMode();
    service.toggleDemoMode();
    expect(service.isDemoMode()).toBe(!initial);
    service.toggleDemoMode();
    expect(service.isDemoMode()).toBe(initial);
  });

  it('should explicitly set demo mode and persist to sessionStorage', () => {
    service.setDemoMode(true);
    expect(service.isDemoMode()).toBe(true);
    expect(sessionStorage.getItem('aep_demo_mode')).toBe('true');

    service.setDemoMode(false);
    expect(service.isDemoMode()).toBe(false);
    expect(sessionStorage.getItem('aep_demo_mode')).toBe('false');
  });
});
