/**
 * AR.TextPrompt.js
 * Multi-step text input with file attachments for AI analytics
 * Supports BiDi layouts, file checksums, and MVVM integration
 * Files are grouped by step
 */
(function(window) {
    'use strict';

    var AR = window.AR || {};

    // ============================================================================
    // UTILITIES
    // ============================================================================

    function addClass(element, className) {
        if (element.classList) {
            element.classList.add(className);
        } else {
            element.className += ' ' + className;
        }
    }

    function removeClass(element, className) {
        if (element.classList) {
            element.classList.remove(className);
        } else {
            element.className = element.className.replace(
                new RegExp('(^|\\b)' + className.split(' ').join('|') + '(\\b|$)', 'gi'), ' '
            );
        }
    }

    function getElement(selector) {
        if (typeof selector === 'string') {
            return document.querySelector(selector);
        }
        return selector;
    }

    var uniqueIdCounter = 0;
    function generateId(prefix) {
        uniqueIdCounter++;
        return prefix + '-' + uniqueIdCounter + '-' + Date.now();
    }

    /**
     * Calculate SHA-256 checksum for file content
     */
    function calculateChecksum(file) {
        return file.arrayBuffer().then(function(buffer) {
            return crypto.subtle.digest('SHA-256', buffer);
        }).then(function(hashBuffer) {
            var hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(function(b) {
                return b.toString(16).padStart(2, '0');
            }).join('');
        });
    }

    /**
     * Format bytes to human-readable size
     */
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        var k = 1024;
        var sizes = ['B', 'KB', 'MB', 'GB'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // ============================================================================
    // TEXT PROMPT COMPONENT
    // ============================================================================

    /**
     * AR.TextPrompt - Multi-step text input with file attachments
     * Options:
     *   - maxFileSize: Maximum total file size in bytes (default: 30MB)
     *   - acceptedTypes: Array of accepted MIME types
     *   - calculateChecksum: Enable checksum calculation (default: true)
     *   - minSteps: Minimum number of steps (default: 1)
     *   - onSubmit: Callback for form submission
     *   - htmxTarget: HTMX target URL for submission
     */
    AR.TextPrompt = function(selector, options) {
        this.element = getElement(selector);
        if (!this.element) {
            throw new Error('TextPrompt container not found: ' + selector);
        }

        this.options = {
            maxFileSize: options && options.maxFileSize !== undefined ? options.maxFileSize : 30 * 1024 * 1024, // 30MB
            acceptedTypes: options && options.acceptedTypes || [
                'text/csv',
                'text/plain',
                'application/json',
                'text/rtf',
                'application/pdf',
                'image/*'
            ],
            calculateChecksum: options && options.calculateChecksum !== undefined ? options.calculateChecksum : true,
            minSteps: options && options.minSteps !== undefined ? options.minSteps : 1,
            onSubmit: options && options.onSubmit || null,
            htmxTarget: options && options.htmxTarget || null
        };

        this.steps = [];
        this.files = [];
        this.totalFileSize = 0;
        this.isRTL = this.detectBiDi();

        this.init();
    };

    AR.TextPrompt.prototype.detectBiDi = function() {
        var dir = document.documentElement.dir ||
                  window.getComputedStyle(document.documentElement).direction;
        return dir === 'rtl';
    };

    AR.TextPrompt.prototype.init = function() {
        var self = this;

        addClass(this.element, 'ar-textprompt');

        if (this.isRTL) {
            addClass(this.element, 'rtl');
        }

        // Create main container with two panels
        this.container = document.createElement('div');
        addClass(this.container, 'textprompt-container');

        // Create steps panel (left/right depending on BiDi)
        this.stepsPanel = document.createElement('div');
        addClass(this.stepsPanel, 'textprompt-steps-panel');

        this.stepsContainer = document.createElement('div');
        addClass(this.stepsContainer, 'textprompt-steps');
        this.stepsPanel.appendChild(this.stepsContainer);

        // Add step controls
        var controlsDiv = document.createElement('div');
        addClass(controlsDiv, 'textprompt-step-controls');

        this.addStepBtn = document.createElement('button');
        this.addStepBtn.setAttribute('type', 'button');
        this.addStepBtn.setAttribute('aria-label', 'Add step');
        addClass(this.addStepBtn, 'btn-add-step');
        this.addStepBtn.innerHTML = '<span class="icon-plus"></span> Add Step';

        controlsDiv.appendChild(this.addStepBtn);
        this.stepsPanel.appendChild(controlsDiv);

        // Create files panel
        this.filesPanel = document.createElement('div');
        addClass(this.filesPanel, 'textprompt-files-panel');

        var filesPanelTitle = document.createElement('h3');
        filesPanelTitle.textContent = 'Attached Files';
        this.filesPanel.appendChild(filesPanelTitle);

        // Progress bar for file size
        var progressContainer = document.createElement('div');
        progressContainer.setAttribute('id', generateId('progress-container'));
        this.filesPanel.appendChild(progressContainer);

        this.progressBar = new AR.ProgressBar(progressContainer, {
            max: this.options.maxFileSize,
            value: 0,
            labelFormat: 'value',
            variant: 'default',
            showLabel: true
        });

        // Files grid container
        this.filesGridContainer = document.createElement('div');
        this.filesGridContainer.setAttribute('id', generateId('files-grid'));
        addClass(this.filesGridContainer, 'files-grid-container');
        this.filesPanel.appendChild(this.filesGridContainer);

        // Arrange panels based on BiDi
        if (this.isRTL) {
            this.container.appendChild(this.filesPanel);
            this.container.appendChild(this.stepsPanel);
        } else {
            this.container.appendChild(this.stepsPanel);
            this.container.appendChild(this.filesPanel);
        }

        this.element.appendChild(this.container);

        // Create submit button
        var submitDiv = document.createElement('div');
        addClass(submitDiv, 'textprompt-submit');

        this.submitBtn = document.createElement('button');
        this.submitBtn.setAttribute('type', 'submit');
        addClass(this.submitBtn, 'btn-submit');
        this.submitBtn.textContent = 'Submit';

        submitDiv.appendChild(this.submitBtn);
        this.element.appendChild(submitDiv);

        // Event listeners
        this.addStepBtn.addEventListener('click', function() {
            self.addStep();
        });

        this.submitBtn.addEventListener('click', function(e) {
            e.preventDefault();
            self.handleSubmit();
        });

        // Add initial step
        this.addStep();
    };

    AR.TextPrompt.prototype.addStep = function() {
        var self = this;
        var stepNumber = this.steps.length + 1;

        var stepDiv = document.createElement('div');
        addClass(stepDiv, 'textprompt-step');
        stepDiv.setAttribute('data-step-id', generateId('step'));
        stepDiv.setAttribute('data-step-number', stepNumber);

        // Step header with editable label
        var stepHeader = document.createElement('div');
        addClass(stepHeader, 'step-header');

        var stepLabel = document.createElement('span');
        addClass(stepLabel, 'step-label');
        stepLabel.setAttribute('contenteditable', 'true');
        stepLabel.setAttribute('role', 'textbox');
        stepLabel.setAttribute('aria-label', 'Edit step name');
        stepLabel.textContent = 'Step ' + stepNumber;
        stepLabel.dataset.defaultLabel = 'Step ' + stepNumber;

        var removeBtn = document.createElement('button');
        removeBtn.setAttribute('type', 'button');
        removeBtn.setAttribute('aria-label', 'Remove step');
        addClass(removeBtn, 'btn-remove-step');
        removeBtn.innerHTML = '<span class="icon-minus"></span>';

        // Disable remove button if at minimum steps
        if (this.steps.length < this.options.minSteps) {
            removeBtn.disabled = true;
        }

        stepHeader.appendChild(stepLabel);
        stepHeader.appendChild(removeBtn);

        // Textarea for step content
        var textarea = document.createElement('textarea');
        addClass(textarea, 'step-textarea');
        textarea.setAttribute('placeholder', 'Enter text for this step...');
        textarea.setAttribute('rows', '4');
        textarea.setAttribute('aria-label', 'Step ' + stepNumber + ' content');

        // File upload for this step
        var fileUploadDiv = document.createElement('div');
        addClass(fileUploadDiv, 'step-file-upload');

        var fileInput = document.createElement('input');
        fileInput.setAttribute('type', 'file');
        fileInput.setAttribute('id', generateId('file-input'));
        fileInput.setAttribute('multiple', 'multiple');
        fileInput.setAttribute('accept', this.options.acceptedTypes.join(','));
        fileInput.style.display = 'none';

        var uploadBtn = document.createElement('button');
        uploadBtn.setAttribute('type', 'button');
        uploadBtn.setAttribute('aria-label', 'Upload files for this step');
        addClass(uploadBtn, 'btn-upload-step');
        uploadBtn.innerHTML = '<span class="icon-upload"></span> Attach Files';

        fileUploadDiv.appendChild(fileInput);
        fileUploadDiv.appendChild(uploadBtn);

        stepDiv.appendChild(stepHeader);
        stepDiv.appendChild(textarea);
        stepDiv.appendChild(fileUploadDiv);

        this.stepsContainer.appendChild(stepDiv);

        var stepData = {
            id: stepDiv.getAttribute('data-step-id'),
            number: stepNumber,
            element: stepDiv,
            label: stepLabel,
            textarea: textarea,
            removeBtn: removeBtn,
            fileInput: fileInput,
            uploadBtn: uploadBtn
        };

        this.steps.push(stepData);

        // Remove button handler
        removeBtn.addEventListener('click', function() {
            self.removeStep(stepData.id);
        });

        // File upload handler
        uploadBtn.addEventListener('click', function() {
            fileInput.click();
        });

        fileInput.addEventListener('change', function(e) {
            self.handleFileUpload(e.target.files, stepNumber);
        });

        // Update all remove buttons
        this.updateRemoveButtons();
    };

    AR.TextPrompt.prototype.removeStep = function(stepId) {
        var index = -1;
        for (var i = 0; i < this.steps.length; i++) {
            if (this.steps[i].id === stepId) {
                index = i;
                break;
            }
        }

        if (index === -1 || this.steps.length <= this.options.minSteps) {
            return;
        }

        var step = this.steps[index];
        var stepNumber = step.number;

        // Remove files associated with this step
        var filesToRemove = [];
        for (var i = 0; i < this.files.length; i++) {
            if (this.files[i].stepNumber === stepNumber) {
                filesToRemove.push(this.files[i].id);
            }
        }

        for (var i = 0; i < filesToRemove.length; i++) {
            this.removeFile(filesToRemove[i]);
        }

        step.element.parentNode.removeChild(step.element);
        this.steps.splice(index, 1);

        // Renumber remaining steps
        for (var i = 0; i < this.steps.length; i++) {
            var newNumber = i + 1;
            this.steps[i].number = newNumber;
            this.steps[i].element.setAttribute('data-step-number', newNumber);

            var defaultLabel = 'Step ' + newNumber;
            this.steps[i].label.dataset.defaultLabel = defaultLabel;

            // Update label if it's still the default
            if (this.steps[i].label.textContent.startsWith('Step ')) {
                this.steps[i].label.textContent = defaultLabel;
            }

            // Update file associations
            for (var j = 0; j < this.files.length; j++) {
                if (this.files[j].stepNumber > stepNumber) {
                    this.files[j].stepNumber--;
                }
            }
        }

        this.updateRemoveButtons();
        this.updateFilesGrid();
    };

    AR.TextPrompt.prototype.updateRemoveButtons = function() {
        var canRemove = this.steps.length > this.options.minSteps;

        for (var i = 0; i < this.steps.length; i++) {
            this.steps[i].removeBtn.disabled = !canRemove;
        }
    };

    AR.TextPrompt.prototype.handleFileUpload = function(fileList, stepNumber) {
        var self = this;
        var files = Array.from(fileList);

        for (var i = 0; i < files.length; i++) {
            var file = files[i];

            // Check if adding this file would exceed limit
            if (this.totalFileSize + file.size > this.options.maxFileSize) {
                alert('Adding this file would exceed the ' + formatBytes(this.options.maxFileSize) + ' limit.');
                continue;
            }

            this.totalFileSize += file.size;

            var fileData = {
                id: generateId('file'),
                stepNumber: stepNumber,
                file: file,
                name: file.name,
                size: file.size,
                type: file.type,
                checksum: null,
                checksumStatus: 'pending'
            };

            this.files.push(fileData);

            // Calculate checksum if enabled
            if (this.options.calculateChecksum) {
                fileData.checksumStatus = 'calculating';
                this.updateFilesGrid();

                calculateChecksum(file).then(function(hash) {
                    fileData.checksum = hash;
                    fileData.checksumStatus = 'complete';
                    self.updateFilesGrid();
                }).catch(function(error) {
                    console.error('Checksum calculation failed:', error);
                    fileData.checksumStatus = 'error';
                    self.updateFilesGrid();
                });
            }
        }

        // Update progress bar
        this.progressBar.setValue(this.totalFileSize);
        this.updateProgressBarVariant();

        // Reset file input
        for (var i = 0; i < this.steps.length; i++) {
            if (this.steps[i].number === stepNumber) {
                this.steps[i].fileInput.value = '';
                break;
            }
        }

        this.updateFilesGrid();
    };

    AR.TextPrompt.prototype.updateProgressBarVariant = function() {
        var percentage = (this.totalFileSize / this.options.maxFileSize) * 100;

        if (percentage >= 90) {
            this.progressBar.setVariant('danger');
        } else if (percentage >= 70) {
            this.progressBar.setVariant('warning');
        } else {
            this.progressBar.setVariant('default');
        }
    };

    AR.TextPrompt.prototype.removeFile = function(fileId) {
        var index = -1;
        for (var i = 0; i < this.files.length; i++) {
            if (this.files[i].id === fileId) {
                index = i;
                break;
            }
        }

        if (index === -1) return;

        var file = this.files[index];
        this.totalFileSize -= file.size;
        this.files.splice(index, 1);

        this.progressBar.setValue(this.totalFileSize);
        this.updateProgressBarVariant();
        this.updateFilesGrid();
    };

    AR.TextPrompt.prototype.updateFilesGrid = function() {
        var self = this;

        // Clear existing grid
        this.filesGridContainer.innerHTML = '';

        if (this.files.length === 0) {
            var emptyMsg = document.createElement('p');
            addClass(emptyMsg, 'files-empty-message');
            emptyMsg.textContent = 'No files attached';
            this.filesGridContainer.appendChild(emptyMsg);
            return;
        }

        // Group files by step
        var filesByStep = {};
        for (var i = 0; i < this.files.length; i++) {
            var file = this.files[i];
            var stepNum = file.stepNumber;

            if (!filesByStep[stepNum]) {
                filesByStep[stepNum] = [];
            }
            filesByStep[stepNum].push(file);
        }

        // Create grouped display
        var stepNumbers = Object.keys(filesByStep).sort(function(a, b) { return parseInt(a) - parseInt(b); });

        for (var s = 0; s < stepNumbers.length; s++) {
            var stepNum = stepNumbers[s];
            var stepFiles = filesByStep[stepNum];

            // Get step label
            var stepLabel = 'Step ' + stepNum;
            for (var i = 0; i < this.steps.length; i++) {
                if (this.steps[i].number === parseInt(stepNum)) {
                    stepLabel = this.steps[i].label.textContent;
                    break;
                }
            }

            // Step group header
            var groupHeader = document.createElement('div');
            addClass(groupHeader, 'files-group-header');
            groupHeader.textContent = stepLabel + ' (' + stepFiles.length + ' file' + (stepFiles.length !== 1 ? 's' : '') + ')';
            this.filesGridContainer.appendChild(groupHeader);

            // Create table for this step
            var table = document.createElement('table');
            addClass(table, 'files-table');

            var thead = document.createElement('thead');
            var headerRow = document.createElement('tr');

            var headers = ['Name', 'Size', 'Checksum', 'Actions'];
            for (var h = 0; h < headers.length; h++) {
                var th = document.createElement('th');
                th.textContent = headers[h];
                headerRow.appendChild(th);
            }

            thead.appendChild(headerRow);
            table.appendChild(thead);

            var tbody = document.createElement('tbody');

            for (var f = 0; f < stepFiles.length; f++) {
                var fileData = stepFiles[f];
                var row = document.createElement('tr');

                // Name
                var nameCell = document.createElement('td');
                nameCell.textContent = fileData.name;
                nameCell.title = fileData.name;
                row.appendChild(nameCell);

                // Size
                var sizeCell = document.createElement('td');
                sizeCell.textContent = formatBytes(fileData.size);
                row.appendChild(sizeCell);

                // Checksum
                var checksumCell = document.createElement('td');
                if (this.options.calculateChecksum) {
                    if (fileData.checksumStatus === 'calculating') {
                        checksumCell.textContent = 'Calculating...';
                        addClass(checksumCell, 'checksum-calculating');
                    } else if (fileData.checksumStatus === 'complete') {
                        var checksumShort = fileData.checksum.substring(0, 8) + '...';
                        checksumCell.textContent = checksumShort;
                        checksumCell.title = fileData.checksum;
                        addClass(checksumCell, 'checksum-complete');
                    } else if (fileData.checksumStatus === 'error') {
                        checksumCell.textContent = 'Error';
                        addClass(checksumCell, 'checksum-error');
                    }
                } else {
                    checksumCell.textContent = '-';
                }
                row.appendChild(checksumCell);

                // Actions
                var actionsCell = document.createElement('td');
                var removeBtn = document.createElement('button');
                removeBtn.setAttribute('type', 'button');
                removeBtn.setAttribute('aria-label', 'Remove file');
                addClass(removeBtn, 'btn-remove-file');
                removeBtn.textContent = 'Remove';

                (function(fileId) {
                    removeBtn.addEventListener('click', function() {
                        self.removeFile(fileId);
                    });
                })(fileData.id);

                actionsCell.appendChild(removeBtn);
                row.appendChild(actionsCell);

                tbody.appendChild(row);
            }

            table.appendChild(tbody);
            this.filesGridContainer.appendChild(table);
        }
    };

    AR.TextPrompt.prototype.getStepsData = function() {
        var stepsData = [];

        for (var i = 0; i < this.steps.length; i++) {
            var step = this.steps[i];
            var label = step.label.textContent.trim();
            var defaultLabel = step.label.dataset.defaultLabel;

            // Get files for this step
            var stepFiles = [];
            for (var j = 0; j < this.files.length; j++) {
                if (this.files[j].stepNumber === step.number) {
                    stepFiles.push(this.files[j].name);
                }
            }

            var stepData = {
                stepNumber: i + 1,
                content: step.textarea.value.trim(),
                fileCount: stepFiles.length
            };

            // Only include custom name if it was changed
            if (label !== defaultLabel) {
                stepData.stepName = label;
            }

            if (stepFiles.length > 0) {
                stepData.files = stepFiles;
            }

            stepsData.push(stepData);
        }

        return stepsData;
    };

    AR.TextPrompt.prototype.getFilesData = function() {
        var filesData = [];

        for (var i = 0; i < this.files.length; i++) {
            var file = this.files[i];
            var fileData = {
                stepNumber: file.stepNumber,
                name: file.name,
                size: file.size,
                type: file.type
            };

            if (this.options.calculateChecksum && file.checksum) {
                fileData.checksum = file.checksum;
            }

            filesData.push(fileData);
        }

        return filesData;
    };

    AR.TextPrompt.prototype.handleSubmit = function() {
        var data = {
            steps: this.getStepsData(),
            files: this.getFilesData(),
            totalFileSize: this.totalFileSize
        };

        // Call custom submit handler if provided
        if (this.options.onSubmit) {
            this.options.onSubmit(data, this.files);
        }

        // HTMX integration
        if (this.options.htmxTarget && window.htmx) {
            // Create FormData for file upload
            var formData = new FormData();
            formData.append('data', JSON.stringify(data));

            for (var i = 0; i < this.files.length; i++) {
                formData.append('files[]', this.files[i].file);
            }

            // Use HTMX to submit
            htmx.ajax('POST', this.options.htmxTarget, {
                values: formData,
                source: this.element
            });
        }

        console.log('TextPrompt submitted:', data);
    };

    AR.TextPrompt.prototype.reset = function() {
        // Clear all steps except the first one
        while (this.steps.length > this.options.minSteps) {
            this.removeStep(this.steps[this.steps.length - 1].id);
        }

        // Clear first step
        if (this.steps.length > 0) {
            this.steps[0].textarea.value = '';
            this.steps[0].label.textContent = this.steps[0].label.dataset.defaultLabel;
        }

        // Clear all files
        this.files = [];
        this.totalFileSize = 0;
        this.progressBar.reset();
        this.updateFilesGrid();
    };

    /**
     * Static factory method
     */
    AR.TextPrompt.create = function(selector, options) {
        return new AR.TextPrompt(selector, options);
    };

    // ============================================================================
    // EXPORT
    // ============================================================================

    window.AR = AR;

})(window);
