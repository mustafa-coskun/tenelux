import { getUserService } from './UserService';
import { getStateManager } from './StateManager';

export interface TabInfo {
  tabId: string;
  timestamp: number;
  isActive: boolean;
  sessionState: string;
  lastHeartbeat: number;
}

export interface TabConflictResolution {
  action: 'take_control' | 'become_spectator' | 'force_logout';
  reason: string;
  conflictingTab?: TabInfo;
}

class TabManager {
  private tabId: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private storageListener: ((e: StorageEvent) => void) | null = null;
  private beforeUnloadListener: ((e: BeforeUnloadEvent) => void) | null = null;
  private visibilityChangeListener: (() => void) | null = null;
  
  private readonly STORAGE_KEYS = {
    ACTIVE_TABS: 'tenebris_active_tabs',
    TAB_MASTER: 'tenebris_tab_master',
    TAB_CONFLICT: 'tenebris_tab_conflict'
  };
  
  private readonly HEARTBEAT_INTERVAL = 5000; // 5 seconds
  private readonly TAB_TIMEOUT = 15000; // 15 seconds
  
  constructor() {
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('🔖 TabManager initialized with ID:', this.tabId);
  }

  // Initialize tab management
  initialize(): void {
    console.log('🔖 Initializing tab management');
    
    // Register this tab
    this.registerTab();
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Check for existing tabs and handle conflicts
    this.checkForConflicts();
  }

  // Register this tab as active
  private registerTab(): void {
    const activeTabs = this.getActiveTabs();
    const userService = getUserService();
    const currentSession = userService.getCurrentSession();
    
    const tabInfo: TabInfo = {
      tabId: this.tabId,
      timestamp: Date.now(),
      isActive: true,
      sessionState: currentSession?.currentState || 'menu',
      lastHeartbeat: Date.now()
    };
    
    activeTabs[this.tabId] = tabInfo;
    localStorage.setItem(this.STORAGE_KEYS.ACTIVE_TABS, JSON.stringify(activeTabs));
    
    console.log('🔖 Tab registered:', tabInfo);
  }

  // Get all active tabs
  private getActiveTabs(): Record<string, TabInfo> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEYS.ACTIVE_TABS);
      if (!stored) return {};
      
      const tabs = JSON.parse(stored);
      const now = Date.now();
      
      // Clean up expired tabs
      const activeTabs: Record<string, TabInfo> = {};
      for (const [tabId, tabInfo] of Object.entries(tabs)) {
        const tab = tabInfo as TabInfo;
        if (now - tab.lastHeartbeat < this.TAB_TIMEOUT) {
          activeTabs[tabId] = tab;
        } else {
          console.log('🔖 Removing expired tab:', tabId);
        }
      }
      
      return activeTabs;
    } catch (error) {
      console.error('Failed to get active tabs:', error);
      return {};
    }
  }

  // Update tab heartbeat
  private updateHeartbeat(): void {
    const activeTabs = this.getActiveTabs();
    if (activeTabs[this.tabId]) {
      activeTabs[this.tabId].lastHeartbeat = Date.now();
      activeTabs[this.tabId].isActive = !document.hidden;
      
      // Update session state
      const userService = getUserService();
      const currentSession = userService.getCurrentSession();
      activeTabs[this.tabId].sessionState = currentSession?.currentState || 'menu';
      
      localStorage.setItem(this.STORAGE_KEYS.ACTIVE_TABS, JSON.stringify(activeTabs));
    }
  }

  // Start heartbeat to keep tab alive
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat();
    }, this.HEARTBEAT_INTERVAL);
  }

  // Stop heartbeat
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Set up event listeners for tab management
  private setupEventListeners(): void {
    // Listen for localStorage changes from other tabs
    this.storageListener = (e: StorageEvent) => {
      if (e.key === this.STORAGE_KEYS.ACTIVE_TABS) {
        this.handleTabListChange();
      } else if (e.key === this.STORAGE_KEYS.TAB_CONFLICT) {
        this.handleConflictResolution();
      }
    };
    window.addEventListener('storage', this.storageListener);

    // Handle page unload (tab close vs refresh detection)
    this.beforeUnloadListener = (e: BeforeUnloadEvent) => {
      this.handleBeforeUnload(e);
    };
    window.addEventListener('beforeunload', this.beforeUnloadListener);

    // Handle visibility change (tab switching)
    this.visibilityChangeListener = () => {
      this.handleVisibilityChange();
    };
    document.addEventListener('visibilitychange', this.visibilityChangeListener);

    // Handle page focus/blur
    window.addEventListener('focus', () => {
      this.updateHeartbeat();
      this.checkForConflicts();
    });

    window.addEventListener('blur', () => {
      this.updateHeartbeat();
    });
  }

  // Handle tab list changes from other tabs
  private handleTabListChange(): void {
    const activeTabs = this.getActiveTabs();
    const otherTabs = Object.values(activeTabs).filter(tab => tab.tabId !== this.tabId);
    
    if (otherTabs.length > 0) {
      console.log('🔖 Other tabs detected:', otherTabs.length);
      this.checkForConflicts();
    }
  }

  // Check for session conflicts between tabs
  private checkForConflicts(): void {
    const activeTabs = this.getActiveTabs();
    const userService = getUserService();
    const currentSession = userService.getCurrentSession();
    
    if (!currentSession || currentSession.currentState === 'menu') {
      return; // No conflict in menu state
    }
    
    // Find other tabs with active sessions
    const conflictingTabs = Object.values(activeTabs).filter(tab => 
      tab.tabId !== this.tabId && 
      tab.sessionState !== 'menu' &&
      tab.isActive
    );
    
    if (conflictingTabs.length > 0) {
      console.log('🔖 Session conflict detected with tabs:', conflictingTabs);
      this.resolveConflict(conflictingTabs[0]);
    }
  }

  // Resolve conflict between tabs
  private resolveConflict(conflictingTab: TabInfo): void {
    const userService = getUserService();
    const currentSession = userService.getCurrentSession();
    
    if (!currentSession) return;
    
    // Determine resolution strategy
    let resolution: TabConflictResolution;
    
    // If this tab is newer, take control
    if (this.tabId > conflictingTab.tabId) {
      resolution = {
        action: 'take_control',
        reason: 'This tab is newer and will take control of the session',
        conflictingTab
      };
    } else {
      // If this tab is older, become spectator or logout
      if (currentSession.currentState === 'tournament') {
        resolution = {
          action: 'become_spectator',
          reason: 'Another tab has taken control. Switching to spectator mode.',
          conflictingTab
        };
      } else {
        resolution = {
          action: 'force_logout',
          reason: 'Another tab has taken control. Returning to menu.',
          conflictingTab
        };
      }
    }
    
    // Store resolution for this tab to handle
    sessionStorage.setItem('tenebris_tab_resolution', JSON.stringify(resolution));
    
    // Notify other tabs about the conflict resolution
    localStorage.setItem(this.STORAGE_KEYS.TAB_CONFLICT, JSON.stringify({
      timestamp: Date.now(),
      resolvingTab: this.tabId,
      resolution
    }));
    
    console.log('🔖 Conflict resolution:', resolution);
    
    // Apply resolution
    this.applyConflictResolution(resolution);
  }

  // Apply conflict resolution
  private applyConflictResolution(resolution: TabConflictResolution): void {
    const userService = getUserService();
    const stateManager = getStateManager();
    
    switch (resolution.action) {
      case 'take_control':
        // This tab takes control - no action needed, just continue
        console.log('🔖 Taking control of session');
        break;
        
      case 'become_spectator':
        // Switch to spectator mode
        console.log('🔖 Switching to spectator mode due to tab conflict');
        userService.updateSession({
          currentState: 'spectator'
        });
        
        // Trigger UI update (this would need to be handled by the component)
        window.dispatchEvent(new CustomEvent('tab-conflict-spectator', {
          detail: { resolution }
        }));
        break;
        
      case 'force_logout':
        // Force logout and return to menu
        console.log('🔖 Forcing logout due to tab conflict');
        userService.leaveLobby(); // This sets state to menu
        stateManager.clearLobbyState();
        
        // Trigger UI update
        window.dispatchEvent(new CustomEvent('tab-conflict-logout', {
          detail: { resolution }
        }));
        break;
    }
  }

  // Handle conflict resolution messages from other tabs
  private handleConflictResolution(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEYS.TAB_CONFLICT);
      if (!stored) return;
      
      const conflictData = JSON.parse(stored);
      
      // Only handle if this is not the resolving tab
      if (conflictData.resolvingTab !== this.tabId) {
        console.log('🔖 Received conflict resolution from another tab');
        
        // Apply the resolution if it affects this tab
        if (conflictData.resolution.conflictingTab?.tabId === this.tabId) {
          this.applyConflictResolution(conflictData.resolution);
        }
      }
    } catch (error) {
      console.error('Failed to handle conflict resolution:', error);
    }
  }

  // Handle before unload (detect tab close vs refresh)
  private handleBeforeUnload(e: BeforeUnloadEvent): void {
    const userService = getUserService();
    const currentSession = userService.getCurrentSession();
    
    // Check if user is in an active session
    if (currentSession && currentSession.currentState !== 'menu') {
      // Set a flag to detect if this is a refresh vs close
      sessionStorage.setItem('tenebris_before_unload', Date.now().toString());
      
      // Check if user marked intentional leave
      const isIntentional = userService.isIntentionalDisconnection();
      
      if (!isIntentional) {
        // This might be accidental - show warning for important sessions
        if (currentSession.currentState === 'tournament') {
          e.preventDefault();
          e.returnValue = 'Turnuva devam ediyor. Sayfayı kapatmak istediğinizden emin misiniz?';
          return e.returnValue;
        } else if (currentSession.currentState === 'lobby') {
          e.preventDefault();
          e.returnValue = 'Lobide oyuncular sizi bekliyor. Sayfayı kapatmak istediğinizden emin misiniz?';
          return e.returnValue;
        }
      }
    }
    
    // Clean up this tab
    this.unregisterTab();
  }

  // Handle visibility change (tab switching)
  private handleVisibilityChange(): void {
    const activeTabs = this.getActiveTabs();
    if (activeTabs[this.tabId]) {
      activeTabs[this.tabId].isActive = !document.hidden;
      localStorage.setItem(this.STORAGE_KEYS.ACTIVE_TABS, JSON.stringify(activeTabs));
    }
    
    // If tab becomes visible, check for conflicts
    if (!document.hidden) {
      setTimeout(() => {
        this.checkForConflicts();
      }, 100);
    }
  }

  // Detect if current page load is a refresh vs new tab
  isPageRefresh(): boolean {
    const beforeUnloadTime = sessionStorage.getItem('tenebris_before_unload');
    if (beforeUnloadTime) {
      const timeDiff = Date.now() - parseInt(beforeUnloadTime);
      sessionStorage.removeItem('tenebris_before_unload');
      
      // If less than 5 seconds, likely a refresh
      return timeDiff < 5000;
    }
    return false;
  }

  // Get information about other active tabs
  getOtherActiveTabs(): TabInfo[] {
    const activeTabs = this.getActiveTabs();
    return Object.values(activeTabs).filter(tab => tab.tabId !== this.tabId);
  }

  // Check if this is the master tab (oldest active tab)
  isMasterTab(): boolean {
    const activeTabs = this.getActiveTabs();
    const allTabs = Object.values(activeTabs).sort((a, b) => a.timestamp - b.timestamp);
    return allTabs.length > 0 && allTabs[0].tabId === this.tabId;
  }

  // Force become master tab
  becomeMasterTab(): void {
    localStorage.setItem(this.STORAGE_KEYS.TAB_MASTER, this.tabId);
    console.log('🔖 Became master tab:', this.tabId);
  }

  // Unregister this tab
  private unregisterTab(): void {
    const activeTabs = this.getActiveTabs();
    delete activeTabs[this.tabId];
    localStorage.setItem(this.STORAGE_KEYS.ACTIVE_TABS, JSON.stringify(activeTabs));
    console.log('🔖 Tab unregistered:', this.tabId);
  }

  // Clean up tab manager
  destroy(): void {
    console.log('🔖 Destroying tab manager');
    
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Remove event listeners
    if (this.storageListener) {
      window.removeEventListener('storage', this.storageListener);
    }
    
    if (this.beforeUnloadListener) {
      window.removeEventListener('beforeunload', this.beforeUnloadListener);
    }
    
    if (this.visibilityChangeListener) {
      document.removeEventListener('visibilitychange', this.visibilityChangeListener);
    }
    
    // Unregister tab
    this.unregisterTab();
  }

  // Get current tab ID
  getTabId(): string {
    return this.tabId;
  }

  // Get tab statistics
  getTabStats(): {
    currentTab: string;
    totalTabs: number;
    activeTabs: number;
    isMaster: boolean;
    otherTabs: TabInfo[];
  } {
    const activeTabs = this.getActiveTabs();
    const otherTabs = Object.values(activeTabs).filter(tab => tab.tabId !== this.tabId);
    const activeCount = Object.values(activeTabs).filter(tab => tab.isActive).length;
    
    return {
      currentTab: this.tabId,
      totalTabs: Object.keys(activeTabs).length,
      activeTabs: activeCount,
      isMaster: this.isMasterTab(),
      otherTabs
    };
  }
}

// Singleton instance
let tabManagerInstance: TabManager | null = null;

export function getTabManager(): TabManager {
  if (!tabManagerInstance) {
    tabManagerInstance = new TabManager();
  }
  return tabManagerInstance;
}

export default TabManager;