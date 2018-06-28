import { Component, OnInit, ViewChild, ViewChildren, ViewContainerRef } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {JobService, JobDescription, Workflow, WorkflowInput} from '../job.service';
import { safeLoad } from 'js-yaml';
import {Job} from '../job';
import {isInteger} from '@ng-bootstrap/ng-bootstrap/util/util';
import {isUndefined} from 'util';


@Component({
  selector: 'app-job-new',
  templateUrl: './job-new.component.html',
  styleUrls: ['./job-new.component.css']
})
export class JobNewComponent implements OnInit {
  workflows: Workflow[];
  jobForm: FormGroup;
  activeWorkflow: Workflow;
  public inputElements: WorkflowInput[];

  files: any;

  @ViewChildren('fileInput') fileInputs;

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private jobService: JobService,
    private viewContainerRef: ViewContainerRef) {
    this.jobForm = this.fb.group({
      name: ['', Validators.required ],
      workflow_index: ['', Validators.required],
      inputControls: this.fb.group({})
    });
    this.workflows = [];
    this.inputElements = [];
    this.files = {};
  }

  ngOnInit() {
    this.jobService.getAllWorkflows.then((w: Workflow[]) => {
      this.workflows = w;
    });
  }

  get inputControls(): FormGroup {
    return this.jobForm.get('inputControls') as FormGroup;
  }

  get jobName(): string {
    return this.jobForm.get('name').value as string;
  }

  resetWorkflow() {
    this.activeWorkflow = null;
  }

  processWorkflow() {
    const index = this.jobForm.get('workflow_index').value;

    if (!this.jobName || isUndefined(index)) {
      this.activeWorkflow = null;
      return;
    }

    const wf = this.workflows[index];
    this.activeWorkflow = wf;
    this.inputElements = [];

    console.log('wf', wf);

    Object.keys(this.inputControls.controls).forEach(control => {
      this.inputControls.removeControl(control);
    });

    for (const input of wf.inputs) {
      this.inputControls.setControl(input.id, new FormControl());
      this.inputControls.get(input.id).setValue(input.default);

      this.inputElements.push(input);
    }
  }

  submit() {
    const wf = this.activeWorkflow;
    console.log('value', this.inputControls.value);

    this.processInputs().then(params => {
      console.log('params', params);

      const job: JobDescription = {
        name: this.jobName,
        workflow: wf.filename,
        input: params
      };

      console.log('job', job);

      return this.jobService.submitJob(job).toPromise();
    }).then(value => {
      console.log('submission made!');
      this.jobService.updateList = true;
      this.jobService.setSelectedJob = value as Job;
    });
  }

  private processInputs(): Promise<any> {
    const directory = this.jobName;
    const inputs = this.activeWorkflow.inputs;

    return this.jobService.createDir(directory).then(_ => {
      return Promise.all(inputs.map(input => {
        const elem = this.inputControls.get(input.id);
        let val = elem.value;

        if (val === null) {
          return Promise.resolve([input.id, null]);
        }

        if (input.type !== 'file') {
          if (input.type === 'boolean') {
            val = !!elem.value;
          } else if (input.type === 'int') {
            val = parseInt(val, 10);
          }

          return Promise.resolve([input.id, val]);
        }

        console.log('inputs', this.fileInputs);
        console.log('inputs', this.fileInputs.map(elm => elm.nativeElement.name), input.id);
        const [fileInput] = this.fileInputs.filter(elm => elm.nativeElement.name === input.id);

        return this.jobService.uploadFile(fileInput.nativeElement.files[0], directory).then(path => {
          return [input.id, {
            class: 'File',
            path: path
          }];
        });
      }));
    }).then(list => {
      const output = {};

      list.forEach(pair => {
        output[pair[0]] = pair[1];
      });

      return output;
    });
  }
}
