/**
 * AR.TenantManager.js
 * Composite MVVM component for managing tenants and their users
 *
 * Features:
 * - Master-detail pattern (tenant list + users grid)
 * - MVVM-based tenant selection
 * - AR.DataGrid for user management
 * - AR.Modal for adding users
 * - Serialization for HTMX submission
 */
(function(window) {
    'use strict';

    var AR = window.AR || {};

    /**
     * TenantManagerViewModel
     * Manages tenants and their users with MVVM observables
     *
     * @param {Object} config - Configuration object
     * @param {Array} config.initialData - Array of tenant objects with users
     * @param {string} config.usersGridSelector - Selector for users DataGrid table
     * @param {string} config.addUserFormSelector - Selector for add user form
     * @param {string} config.addUserModalTitle - Title for add user modal
     */
    function TenantManagerViewModel(config) {
        var self = this;

        if (!config) {
            throw new Error('TenantManagerViewModel: config is required');
        }

        this.config = config;

        // Transform initial data to proper structure
        var tenantsData = (config.initialData || []).map(function(tenant) {
            return {
                id: tenant.id || 0,
                name: tenant.name || '',
                dbSource: tenant.dbSource || 0,
                dbUser: tenant.dbUser || '',
                dbPassword: tenant.dbPassword || '',
                users: tenant.users || []
            };
        });

        // Initialize MVVM ViewModel with observables
        MVVM.ViewModel.call(this, {
            tenants: tenantsData,
            selectedTenant: null,
            selectedTenantIndex: -1,

            // New user form fields
            newUserEmail: '',
            newUserClassification: 'User',

            // UI state
            isLoading: false,
            hasSelection: false,
            errorMessage: ''
        });

        // Initialize DataGrid for users
        if (config.usersGridSelector) {
            var gridElement = document.querySelector(config.usersGridSelector);
            if (gridElement) {
                this.usersGrid = new AR.DataGrid(config.usersGridSelector, {
                    rowCapFirst: 100
                });
            } else {
                console.warn('TenantManager: Users grid element not found:', config.usersGridSelector);
            }
        }

        // Initialize Add User Modal
        if (config.addUserFormSelector) {
            var formElement = document.querySelector(config.addUserFormSelector);
            if (formElement) {
                this.addUserModal = new AR.Modal(config.addUserFormSelector, {
                    title: config.addUserModalTitle || 'Add Tenant User',
                    closeOnBackdrop: false,
                    onShow: function(modal) {
                        // The form element is now inside modal.body
                        // AR.Modal removes display:none, but let's ensure it
                        if (formElement && formElement.style) {
                            formElement.style.display = 'block';
                        }

                        // Apply MVVM bindings only once to avoid stacking listeners
                        if (window.MVVM && modal.body && !modal._mvvmBound) {
                            MVVM.applyBindings(self, modal.body);
                            modal._mvvmBound = true;
                        }
                    }
                });
            } else {
                console.warn('TenantManager: Add user form element not found:', config.addUserFormSelector);
            }
        }

        // Watch for tenant selection changes
        this.selectedTenant.subscribe(function(tenant) {
            self.onTenantSelected(tenant);
        });
    }

    // Inherit from MVVM.ViewModel
    TenantManagerViewModel.prototype = Object.create(MVVM.ViewModel.prototype);
    TenantManagerViewModel.prototype.constructor = TenantManagerViewModel;

    /**
     * Handle tenant selection - update grid and UI state
     */
    TenantManagerViewModel.prototype.onTenantSelected = function(tenant) {
        if (tenant) {
            this.hasSelection.setValue(true);
            this.updateUsersGrid(tenant);
        } else {
            this.hasSelection.setValue(false);
            if (this.usersGrid) {
                this.usersGrid.clearData();
            }
        }
    };

    /**
     * Update users grid with tenant's users
     * Automatically uses Manager for large datasets (> 100 users)
     */
    TenantManagerViewModel.prototype.updateUsersGrid = function(tenant) {
        if (!this.usersGrid) return;

        var users = tenant.users;
        if (users.getValue) {
            users = users.getValue();
        }

        // Transform users to grid format (1-based column indexes)
        var gridData = users.map(function(user) {
            return {
                1: user.email || '',
                2: user.classification || 'User',
                3: user.status || 'Active'
            };
        });

        // Intelligently decide whether to use Manager
        // If Manager is available and dataset is large, use it for performance
        if (AR.DataGrid.Manager && gridData.length > 100) {
            // Use Manager for large datasets with virtual scrolling
            var manager = new AR.DataGrid.Manager({
                source: gridData,
                chunkSize: 500,
                cache: true
            });

            this.usersGrid.setDataManager(manager, {
                bufferRows: 20,
                threshold: 100  // Enable virtual scrolling for > 100 rows
            });

            console.log('TenantManager: Using DataGrid Manager for ' + gridData.length + ' users (virtual scrolling enabled)');
        } else {
            // Classic mode for small datasets (backward compatible)
            this.usersGrid.setData(gridData);
        }
    };

    /**
     * Select a tenant by index
     */
    TenantManagerViewModel.prototype.selectTenant = function(index) {
        var tenants = this.tenants.getValue();

        if (index >= 0 && index < tenants.length) {
            this.selectedTenantIndex.setValue(index);
            this.selectedTenant.setValue(tenants[index]);
        } else {
            this.selectedTenantIndex.setValue(-1);
            this.selectedTenant.setValue(null);
        }
    };

    /**
     * Add a new tenant
     */
    TenantManagerViewModel.prototype.addTenant = function() {
        var newTenant = {
            id: 0,  // Server will assign ID
            name: 'New Tenant',
            dbSource: 0,
            dbUser: '',
            dbPassword: '',
            users: []
        };

        this.tenants.push(newTenant);

        // Select the newly added tenant
        var tenants = this.tenants.getValue();
        this.selectTenant(tenants.length - 1);
    };

    /**
     * Delete the currently selected tenant
     */
    TenantManagerViewModel.prototype.deleteTenant = function() {
        var index = this.selectedTenantIndex.getValue();

        if (index === -1) {
            alert('Please select a tenant to delete');
            return;
        }

        var tenants = this.tenants.getValue();
        var tenant = tenants[index];

        if (!confirm('Delete tenant "' + tenant.name + '" and all its users?')) {
            return;
        }

        // Remove from array
        tenants.splice(index, 1);
        this.tenants.setValue(tenants.slice());

        // Clear selection
        this.selectTenant(-1);
    };

    /**
     * Show add user modal
     */
    TenantManagerViewModel.prototype.showAddUserModal = function() {
        if (this.selectedTenantIndex.getValue() === -1) {
            alert('Please select a tenant first');
            return;
        }

        // Clear form
        this.newUserEmail.setValue('');
        this.newUserClassification.setValue('1');  // Reset to System classification

        if (this.addUserModal) {
            this.addUserModal.show();
        }
    };

    /**
     * Add user to selected tenant
     * Called from modal form
     */
    TenantManagerViewModel.prototype.addUser = function() {
        var email = this.newUserEmail.getValue();
        var classification = this.newUserClassification.getValue();

        if (!email || email.trim() === '') {
            alert('Email is required');
            return;
        }

        var tenant = this.selectedTenant.getValue();
        if (!tenant) {
            alert('No tenant selected');
            return;
        }

        var newUser = {
            id: 0,  // Server will assign ID
            email: email.trim(),
            classification: classification,
            status: 'Active',
            salt: '',  // Will be generated on server
            password: ''  // Will be set via invitation
        };

        // Get users array
        var users = tenant.users;
        if (users.getValue) {
            users = users.getValue();
        }

        // Add to array
        users.push(newUser);

        // Trigger update
        if (tenant.users.setValue) {
            tenant.users.setValue(users.slice());
        }

        // Update grid
        this.updateUsersGrid(tenant);

        // Close modal
        if (this.addUserModal) {
            this.addUserModal.hide();
        }

        // Clear form
        this.newUserEmail.setValue('');
        this.newUserClassification.setValue('1');  // Reset to System classification
    };

    /**
     * Delete a user from the selected tenant
     * Called from grid or user list
     */
    TenantManagerViewModel.prototype.deleteUser = function(userIndex) {
        var tenant = this.selectedTenant.getValue();
        if (!tenant) return;

        var users = tenant.users;
        if (users.getValue) {
            users = users.getValue();
        }

        if (userIndex < 0 || userIndex >= users.length) return;

        var user = users[userIndex];

        if (!confirm('Delete user "' + user.email + '"?')) {
            return;
        }

        // Remove from array
        users.splice(userIndex, 1);

        // Trigger update
        if (tenant.users.setValue) {
            tenant.users.setValue(users.slice());
        }

        // Update grid
        this.updateUsersGrid(tenant);
    };

    /**
     * Serialize entire ViewModel to JSON for HTMX submission
     * Unwraps all observables recursively
     */
    TenantManagerViewModel.prototype.toJSON = function() {
        var tenants = this.tenants.getValue();

        // Deep unwrap tenants and users
        var serialized = tenants.map(function(tenant) {
            var users = tenant.users;
            if (users.getValue) {
                users = users.getValue();
            }

            return {
                id: tenant.id,
                name: tenant.name,
                dbSource: tenant.dbSource,
                dbUser: tenant.dbUser,
                dbPassword: tenant.dbPassword,
                users: users.map(function(user) {
                    return {
                        id: user.id,
                        email: user.email,
                        classification: user.classification,
                        status: user.status,
                        salt: user.salt || '',
                        password: user.password || ''
                    };
                })
            };
        });

        return {
            tenants: serialized
        };
    };

    /**
     * Get JSON string for form submission
     */
    TenantManagerViewModel.prototype.toJSONString = function() {
        return JSON.stringify(this.toJSON());
    };

    /**
     * Save all tenants and users via HTMX
     */
    TenantManagerViewModel.prototype.saveAll = function() {
        var self = this;

        if (!window.htmx) {
            console.error('TenantManager: HTMX is required for saveAll()');
            alert('HTMX is not loaded. Cannot save.');
            return;
        }

        this.isLoading.setValue(true);
        this.errorMessage.setValue('');

        var data = this.toJSON();
        var endpoint = this.config.saveEndpoint || '/system/tenants/save';

        // Use HTMX to submit
        htmx.ajax('POST', endpoint, {
            target: this.config.saveTarget || '#save-result',
            swap: 'innerHTML',
            values: {
                tenants_json: JSON.stringify(data.tenants)
            }
        }).then(function() {
            self.isLoading.setValue(false);
            console.log('TenantManager: Save successful');
        }).catch(function(error) {
            self.isLoading.setValue(false);
            self.errorMessage.setValue('Save failed: ' + error.message);
            console.error('TenantManager: Save failed', error);
        });
    };

    /**
     * Fill with sample data for testing
     */
    TenantManagerViewModel.prototype.fillSampleData = function() {
        var sampleTenants = [
            {
                id: 1,
                name: 'Acme Corporation',
                dbSource: 1,
                dbUser: 'acme_user',
                dbPassword: 'acme_pass',
                users: [
                    { id: 1, email: 'admin@acme.com', classification: 'Admin', status: 'Active' },
                    { id: 2, email: 'user@acme.com', classification: 'User', status: 'Active' }
                ]
            },
            {
                id: 2,
                name: 'Contoso Ltd',
                dbSource: 2,
                dbUser: 'contoso_user',
                dbPassword: 'contoso_pass',
                users: [
                    { id: 3, email: 'admin@contoso.com', classification: 'Admin', status: 'Active' },
                    { id: 4, email: 'manager@contoso.com', classification: 'Manager', status: 'Active' },
                    { id: 5, email: 'user1@contoso.com', classification: 'User', status: 'Active' },
                    { id: 6, email: 'user2@contoso.com', classification: 'User', status: 'Inactive' }
                ]
            },
            {
                id: 3,
                name: 'Globex Inc',
                dbSource: 1,
                dbUser: 'globex_user',
                dbPassword: 'globex_pass',
                users: [
                    { id: 7, email: 'ceo@globex.com', classification: 'Admin', status: 'Active' }
                ]
            }
        ];

        this.tenants.setValue(sampleTenants);

        // Select first tenant
        this.selectTenant(0);

        console.log('TenantManager: Sample data loaded (' + sampleTenants.length + ' tenants)');
    };

    /**
     * Clear all data
     */
    TenantManagerViewModel.prototype.clearAll = function() {
        if (!confirm('Clear all tenants and users?')) {
            return;
        }

        this.tenants.setValue([]);
        this.selectTenant(-1);
        this.errorMessage.setValue('');

        console.log('TenantManager: All data cleared');
    };

    // ============================================================================
    // EXPORT
    // ============================================================================

    AR.TenantManagerViewModel = TenantManagerViewModel;
    window.AR = AR;

})(window);
