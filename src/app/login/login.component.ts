import { Component, OnInit } from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {JobService} from '../job.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  form: FormGroup;
  status: string;

  constructor(
    private fb: FormBuilder,
    private jobService: JobService
  ) {
    this.status = 'pending';
    this.form = this.fb.group({
      username: [''],
      password: [''],
    });
  }

  ngOnInit() {

  }

  submit() {
    this.status = 'loading';

    const values = this.form.value;
    this.jobService
      .connect(values.username, values.password)
      .then(_ => this.status = 'pending')
      .catch(_ => this.status = 'error');
  }
}
