import { Component, OnInit, ViewChild, ViewChildren, ViewContainerRef } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { JobService, JobDescription } from '../job.service';
import { safeLoad } from 'js-yaml';
import {Workflow, WorkflowService} from '../workflow.service';
import {Job} from '../job';

interface InputElement {
  id: string;
  workflowInput:
};

interface InputElement {
  id: string;
  type: 'checkbox' | 'file' | 'number' | 'text';
  value: string|null;
}

interface FileInput {
  id: string;
  path: string;
}

interface FileLocations {
  [x: string]: FileInput;
}

@Component({
  selector: 'app-job-new',
  templateUrl: './job-new.component.html',
  styleUrls: ['./job-new.component.css']
})
export class JobNewComponent implements OnInit {
  workflows: Workflow[];
  jobForm: FormGroup;
  activeWorkflow: Workflow;
  public inputs: InputElement[];

  files: FileLocations;

  @ViewChild('fileInput') fileInput;
  @ViewChildren('inputFileInput') inputFileInput;

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private jobService: JobService,
    private workflowService: WorkflowService,
    private viewContainerRef: ViewContainerRef) {
    this.jobForm = this.fb.group({
      name: ['', Validators.required ],
      workflow_index: ['', Validators.required],
      inputControls: this.fb.group({})
    });
    this.workflows = [];
    this.inputs = [];
    this.files = {};
  }

  ngOnInit() {
    this.workflowService.getAllWorkflows.then((w: Workflow[]) => {
      this.workflows = w;
    });
  }

  get inputControls(): FormGroup {
    return this.jobForm.get('inputControls') as FormGroup;
  }

  get jobName(): string {
    return this.jobForm.get('name').value as string;
  }

  processWorkflow() {
    const index = this.jobForm.get('workflow_index').value;
    if (this.jobName && index.length) {
      this.activeWorkflow = this.workflows[index];
    }
  }

  submit() {
    if (this.jobForm.valid) {
      this.uploadFiles().then(success => {
        this.submitJob();
      }, error => {
        console.log(error);
      });
    } else {
      console.log('errors', this.jobForm.errors);

      Object.keys(this.jobForm.controls).forEach(key => {
        console.log(key, this.jobForm.controls[key].invalid);
      });
    }
  }

  uploadFiles(): Promise<void> {
    const dirname = this.jobName;

    return this.jobService.createDir(dirname).then(dirExists => {
      Promise.all(this.inputFileInput.map(element => {
        const native = element.nativeElement;
        if (native.files && native.files[0]) {
          return this.jobService.uploadFile(native.id, native.files[0], dirname).then(() => {
            this.files[native.id] = {
              id: native.id,
              path: dirname + '/' + native.files[0].name
            };
          });
        }
      })).then(() => {
        console.log('everything should be uploaded now.');
      });
    });
  }

  submitJob() {
    const index = this.jobForm.get('workflow_index').value;
    const workflow = this.workflows[index];

    const job: JobDescription = {
      name: this.jobName,
      workflow: workflow.filename,
      input: workflow.inputs
    };

    const input = {};
    Object.keys(this.files).forEach(key => {
      if (key !== 'workflow') {
        input[key] = {
          class: 'File',
          path: this.files[key].path
        };
      }
    });

    this.jobService.submitJob(job).subscribe(
      (value) => {
        console.log('Submission made', value);
        this.jobService.updateList = true;
        this.jobService.setSelectedJob = value as Job;
      },
      (error) => {
        console.log(error);
      }
    );
  }
}
