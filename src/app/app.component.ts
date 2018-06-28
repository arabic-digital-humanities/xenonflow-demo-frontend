import { Component , OnInit } from '@angular/core';
import { JobService } from './job.service';
import { Job } from './job';
import {WorkflowService} from './workflow.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  providers: [JobService, WorkflowService]
})
export class AppComponent implements OnInit {
  panel: string;

  constructor (
    private jobService: JobService
  ) {
    this.jobService.selectedJob.subscribe((value) => {
      if (value != null) {
        this.panel = 'job-detail';
      } else {
        this.panel = 'job-new';
      }
    });
  }

  ngOnInit() {
    this.panel = 'job-new';
  }
}
