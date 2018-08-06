define(function (require) {
	'use strict';

	var React = require('react');
	var client = require('./client');
	var follow = require('./follow');

	var stompClient = require('./websocket-listener');

	var root = '/api';

	var App = React.createClass({
		loadFromServer: function (pageSize) {
			var self = this;
			follow(client, root, [
				{rel: 'employees', params: {size: pageSize}}]).done(function (employeeCollection) {
				client({
					method: 'GET',
					path: employeeCollection.entity._links.self.href + '/schema'
				}).done(function (response) {
					self.setState({
						page: employeeCollection.entity.page,
						employees: employeeCollection.entity._embedded.employees,
						attributes: Object.keys(response.entity.properties),
						pageSize: pageSize,
						links: employeeCollection.entity._links
					});
				})
			});
		},
		// tag::on-create[]
		onCreate: function (newEmployee) {
			var self = this;
			follow(client, root, ['employees']).done(function (response) {
				client({
					method: 'POST',
					path: response.entity._links.self.href,
					entity: newEmployee,
					headers: {'Content-Type': 'application/json'}
				})
			})
		},
		// end::on-create[]
		onUpdate: function (employee, updatedEmployee) {
			client({
				method: 'PUT',
				path: employee._links.self.href,
				entity: updatedEmployee,
				headers: {'Content-Type': 'application/json'}
			});
		},
		onDelete: function (employee) {
			client({method: 'DELETE', path: employee._links.self.href});
		},
		onNavigate: function (navUri) {
			var self = this;
			client({method: 'GET', path: navUri}).done(function (response) {
				self.setState({
					page: response.entity.page,
					employees: response.entity._embedded.employees,
					attributes: self.state.attributes,
					links: response.entity._links
				});
			});
		},
		updatePageSize: function (pageSize) {
			if (pageSize !== this.state.pageSize) {
				this.loadFromServer(pageSize);
			}
		},
		// tag::websocket-handlers[]
		refreshAndGoToLastPage: function (message) {
			var self = this;
			follow(client, root, [{
				rel: 'employees',
				params: {size: this.state.pageSize}
			}]).done(function (response) {
				self.onNavigate(response.entity._links.last.href);
			})
		},

		refreshCurrentPage: function (message) {
			var self = this;
			follow(client, root, [{
				rel: 'employees',
				params: {
					size: this.state.pageSize,
					page: this.state.page.number}
			}]).done(function (response) {
				self.setState({
					page: response.entity.page,
					employees: response.entity._embedded.employees,
					attributes: self.state.attributes,
					links: response.entity._links
				});
			})
		},
		// end::websocket-handlers[]
		getInitialState: function () {
			return ({page: {}, employees: [], attributes: [], pageSize: 2, links: {}});
		},
		// tag::register-handlers[]
		componentDidMount: function () {
			this.loadFromServer(this.state.pageSize);
			stompClient.register([
				{route: '/topic/newEmployee', callback: this.refreshAndGoToLastPage},
				{route: '/topic/updateEmployee', callback: this.refreshCurrentPage},
				{route: '/topic/deleteEmployee', callback: this.refreshCurrentPage}
			]);
		},
		// end::register-handlers[]
		render: function () {
			return (
				<div>
					<CreateDialog attributes={this.state.attributes} onCreate={this.onCreate}/>
					<EmployeeList page={this.state.page}
								  employees={this.state.employees}
								  links={this.state.links}
								  pageSize={this.state.pageSize}
								  attributes={this.state.attributes}
								  onNavigate={this.onNavigate}
								  onUpdate={this.onUpdate}
								  onDelete={this.onDelete}
								  updatePageSize={this.updatePageSize}/>
				</div>
			)
		}
	})

	var CreateDialog = React.createClass({
		handleSubmit: function (e) {
			e.preventDefault();
			var newEmployee = {};
			var self = this;
			this.props.attributes.forEach(function (attribute) {
				newEmployee[attribute] = React.findDOMNode(self.refs[attribute]).value.trim();
			});
			this.props.onCreate(newEmployee);
			this.props.attributes.forEach(function (attribute) {
				React.findDOMNode(self.refs[attribute]).value = ''; // clear out the dialog's inputs
			});
			window.location = "#";
		},
		render: function () {
			var inputs = this.props.attributes.map(function (attribute) {
				return (
					<input key={attribute} type="text" placeholder={attribute} ref={attribute}/>
				)
			})
			return (
				<div>
					<a href="#createEmployee">Create</a>

					<div id="createEmployee" className="modalDialog">
						<div>
							<a href="#" title="Close" className="close">X</a>

							<h2>Create new employee</h2>

							<form>
								{inputs}
								<button onClick={this.handleSubmit}>Create</button>
							</form>
						</div>
					</div>
				</div>
			)
		}
	})

	var UpdateDialog = React.createClass({
		handleSubmit: function (e) {
			e.preventDefault();
			var updatedEmployee = {};
			var self = this;
			this.props.attributes.forEach(function (attribute) {
				updatedEmployee[attribute] = React.findDOMNode(self.refs[attribute]).value.trim();
			});
			this.props.onUpdate(this.props.employee, updatedEmployee);
			this.props.attributes.forEach(function (attribute) {
				React.findDOMNode(self.refs[attribute]).value = ''; // clear out the dialog's inputs
			});
			window.location = "#";
		},
		render: function () {
			var self = this;
			var inputs = this.props.attributes.map(function (attribute) {
				return (
					<input key={attribute} type="text" placeholder={attribute}
						   defaultValue={self.props.employee[attribute]} ref={attribute}/>
				)
			})
			return (
				<div>
					<a href={"#updateEmployee-" + this.props.employee._links.self.href}>Update</a>

					<div id={"updateEmployee-" + this.props.employee._links.self.href} className="modalDialog">
						<div>
							<a href="#" title="Close" className="close">X</a>

							<h2>Update an employee</h2>

							<form>
								{inputs}
								<button onClick={this.handleSubmit}>Update</button>
							</form>
						</div>
					</div>
				</div>
			)
		}
	})

	var EmployeeList = React.createClass({
		handleInput: function (e) {
			e.preventDefault();
			var pageSize = React.findDOMNode(this.refs.pageSize).value;
			if (/^[0-9]+$/.test(pageSize)) {
				this.props.updatePageSize(pageSize);
			} else {
				React.findDOMNode(this.refs.pageSize).value = pageSize.substring(0, pageSize.length - 1);
			}
		},
		handleNavFirst: function (e) {
			e.preventDefault();
			this.props.onNavigate(this.props.links.first.href);
		},
		handleNavPrev: function (e) {
			e.preventDefault();
			this.props.onNavigate(this.props.links.prev.href);
		},
		handleNavNext: function (e) {
			e.preventDefault();
			this.props.onNavigate(this.props.links.next.href);
		},
		handleNavLast: function (e) {
			e.preventDefault();
			this.props.onNavigate(this.props.links.last.href);
		},
		render: function () {
			var self = this;

			var pageInfo = this.props.page.hasOwnProperty("number") ?
				<h3>Employees - Page {this.props.page.number + 1} of {this.props.page.totalPages}</h3> : null;

			var employees = this.props.employees.map(function (employee) {
				return (
					<Employee key={employee._links.self.href}
							  employee={employee}
							  attributes={self.props.attributes}
							  onUpdate={self.props.onUpdate}
							  onDelete={self.props.onDelete}/>
				)
			});

			var navLinks = [];
			if ("first" in this.props.links) {
				navLinks.push(<button key="first" onClick={this.handleNavFirst}>&lt;&lt;</button>);
			}
			if ("prev" in this.props.links) {
				navLinks.push(<button key="prev" onClick={this.handleNavPrev}>&lt;</button>);
			}
			if ("next" in this.props.links) {
				navLinks.push(<button key="next" onClick={this.handleNavNext}>&gt;</button>);
			}
			if ("last" in this.props.links) {
				navLinks.push(<button key="last" onClick={this.handleNavLast}>&gt;&gt;</button>);
			}

			return (
				<div>
					{pageInfo}
					<input ref="pageSize" defaultValue={this.props.pageSize} onInput={this.handleInput}/>
					<table>
						<tr>
							<th>First Name</th>
							<th>Last Name</th>
							<th>Description</th>
							<th></th>
							<th></th>
						</tr>
						{employees}
					</table>
					<div>
						{navLinks}
					</div>
				</div>
			)
		}
	});

	var Employee = React.createClass({
		handleDelete: function () {
			this.props.onDelete(this.props.employee);
		},
		render: function () {
			return (
				<tr>
					<td>{this.props.employee.firstName}</td>
					<td>{this.props.employee.lastName}</td>
					<td>{this.props.employee.description}</td>
					<td>
						<UpdateDialog employee={this.props.employee}
									  attributes={this.props.attributes}
									  onUpdate={this.props.onUpdate}/>
					</td>
					<td>
						<button onClick={this.handleDelete}>Delete</button>
					</td>
				</tr>
			)
		}
	})

	React.render(
		<App />,
		document.getElementById('react')
	)

});